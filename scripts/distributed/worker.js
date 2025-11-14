/**
 * Distributed Load Test Worker
 * Executes load tests as part of a distributed testing cluster
 */

import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import { performance } from 'node:perf_hooks';
import axios from 'axios';
import {
    Hbar,
    TransferTransaction,
} from "@hashgraph/sdk";
import { Utils } from '../utils.js';
import { LatencyTracker } from '../loadTestEnhanced.js';

dotenv.config();

class LoadTestWorker {
    constructor(workerId, coordinatorUrl, port = 3001) {
        this.workerId = workerId || `worker-${os.hostname()}-${Date.now()}`;
        this.coordinatorUrl = coordinatorUrl;
        this.port = port;
        this.currentTest = null;
        this.isRunning = false;
        this.pendingOperations = new Set();
        this.metricsInterval = null;

        this.app = express();
        this.server = null;

        this.setupRoutes();
    }

    setupRoutes() {
        this.app.use(express.json());

        // Start test endpoint
        this.app.post('/api/start', async (req, res) => {
            const { config, testId } = req.body;

            if (this.isRunning) {
                return res.status(400).json({
                    success: false,
                    error: 'Test already in progress'
                });
            }

            try {
                this.startTest(config, testId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Stop test endpoint
        this.app.post('/api/stop', async (req, res) => {
            if (this.isRunning) {
                await this.stopTest();
            }
            res.json({ success: true });
        });

        // Status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                workerId: this.workerId,
                status: this.isRunning ? 'running' : 'idle',
                currentTest: this.currentTest?.testId || null,
                metrics: this.currentTest?.metrics || null
            });
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                workerId: this.workerId,
                uptime: process.uptime()
            });
        });
    }

    async registerWithCoordinator() {
        try {
            const response = await axios.post(
                `${this.coordinatorUrl}/api/worker/register`,
                {
                    workerId: this.workerId,
                    host: `${this.getLocalIP()}:${this.port}`,
                    capabilities: {
                        maxTps: 500,
                        maxAccounts: 100,
                        supportedOperations: [
                            'HBAR_TRANSFER',
                            'TOKEN_TRANSFER',
                            'NFT_TRANSFER',
                            'TOKEN_APPROVAL'
                        ]
                    }
                }
            );

            if (response.data.success) {
                console.log(`Registered with coordinator as ${this.workerId}`);
                return true;
            }
        } catch (error) {
            console.error('Failed to register with coordinator:', error.message);
            return false;
        }
    }

    async sendHeartbeat() {
        try {
            const metrics = this.currentTest?.metrics || null;

            await axios.post(
                `${this.coordinatorUrl}/api/worker/heartbeat`,
                {
                    workerId: this.workerId,
                    status: this.isRunning ? 'running' : 'idle',
                    metrics: metrics ? this.serializeMetrics(metrics) : null
                }
            );
        } catch (error) {
            console.error('Failed to send heartbeat:', error.message);
        }
    }

    serializeMetrics(metrics) {
        // Convert LatencyTracker to serializable format
        return {
            submitted: metrics.submitted,
            success: metrics.success,
            failures: metrics.failures,
            statusCounts: metrics.statusCounts,
            errors: metrics.errors,
            latencies: metrics.latencyTracker?.samples || [],
            latencyStats: metrics.latencyTracker?.getPercentiles() || {},
            startedAt: metrics.startedAt,
            completedAt: metrics.completedAt,
            stage: metrics.stage
        };
    }

    async startTest(config, testId) {
        this.isRunning = true;
        this.currentTest = {
            testId,
            config,
            metrics: this.initTestMetrics(),
            context: null,
            stopRequested: false
        };

        console.log(`Starting test ${testId} on worker ${this.workerId}`);

        try {
            // Initialize Hedera client and wallet
            const client = Utils.initClient();
            const wallet = Utils.initWallet(
                process.env.OPERATOR_ID,
                process.env.OPERATOR_KEY,
                client
            );

            // Create account pool
            console.log(`Creating ${config.accountPoolSize} accounts...`);
            const accounts = await this.createAccountPool(
                wallet,
                client,
                config.accountPoolSize,
                config.accountInitialBalanceHbar
            );

            this.currentTest.context = {
                wallet,
                client,
                accounts,
                config,
                resources: {}
            };

            // Pre-warm resources if needed
            if (config.enableTokenOperations || config.enableNFTOperations) {
                await this.prewarmResources(this.currentTest.context);
            }

            // Build operations
            const operations = this.buildOperations(this.currentTest.context);

            // Execute stages
            for (let i = 0; i < config.stages.length; i++) {
                if (this.currentTest.stopRequested) break;

                const stage = config.stages[i];
                console.log(`Stage ${i + 1}/${config.stages.length}: ${stage.tps} TPS for ${stage.durationSeconds}s`);

                const stageMetrics = this.initStageMetrics(stage, i, config.stages.length);
                await this.runStage(stage, this.currentTest.context, operations, stageMetrics);

                // Update cumulative metrics
                this.updateTestMetrics(this.currentTest.metrics, stageMetrics);
            }

            console.log(`Test ${testId} completed on worker ${this.workerId}`);
        } catch (error) {
            console.error(`Test failed on worker ${this.workerId}:`, error);
            this.currentTest.metrics.error = error.message;
        } finally {
            this.isRunning = false;
        }
    }

    async stopTest() {
        if (this.currentTest) {
            this.currentTest.stopRequested = true;

            // Wait for pending operations
            const timeout = setTimeout(() => {
                console.log('Timeout waiting for operations, forcing stop...');
            }, 5000);

            while (this.pendingOperations.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            clearTimeout(timeout);
        }

        this.isRunning = false;
        console.log(`Test stopped on worker ${this.workerId}`);
    }

    async createAccountPool(wallet, client, size, initialBalanceHbar) {
        const accounts = [];
        for (let i = 0; i < size; i++) {
            const account = await Utils.createAccount(wallet, initialBalanceHbar);
            const signer = Utils.initWallet(
                account.accountId,
                account.accountKey,
                client
            );
            accounts.push({
                label: `${this.workerId}-account-${i}`,
                ...account,
                signer,
            });
        }
        return accounts;
    }

    async prewarmResources(context) {
        const { wallet, accounts, config } = context;

        if (config.enableTokenOperations) {
            console.log("Creating token...");
            const tokenId = await Utils.createHTSToken(wallet);
            context.resources.tokenId = tokenId;

            for (const account of accounts) {
                await Utils.tokenAssociate(
                    wallet,
                    account.accountId,
                    account.accountKey,
                    [tokenId]
                );
            }
        }

        if (config.enableNFTOperations) {
            console.log("Creating NFT collection...");
            const nftTokenId = await Utils.createNFTToken(wallet);
            context.resources.nftTokenId = nftTokenId;

            const nfts = await Utils.mintNFT(wallet, nftTokenId);
            context.resources.nfts = nfts;

            for (const account of accounts) {
                await Utils.tokenAssociate(
                    wallet,
                    account.accountId,
                    account.accountKey,
                    [nftTokenId]
                );
            }
        }
    }

    buildOperations(context) {
        const operations = [];
        const { config } = context;

        operations.push({
            type: "HBAR_TRANSFER",
            weight: config.operationWeights?.HBAR_TRANSFER || 10,
            handler: () => this.executeHbarTransfer(context),
        });

        if (config.enableTokenOperations && context.resources.tokenId) {
            operations.push({
                type: "TOKEN_TRANSFER",
                weight: config.operationWeights?.TOKEN_TRANSFER || 3,
                handler: () => this.executeTokenTransfer(context),
            });
        }

        return operations;
    }

    async executeHbarTransfer(context) {
        const { accounts, config } = context;
        const [sender, receiver] = this.pickDistinctAccounts(accounts);
        const amount = this.pickTransferAmount(config.transferAmountHbarRange);
        const amountHbar = new Hbar(amount);

        let transaction = await new TransferTransaction()
            .addHbarTransfer(sender.accountId, amountHbar.negated())
            .addHbarTransfer(receiver.accountId, amountHbar)
            .freezeWithSigner(sender.signer);

        transaction = await transaction.signWithSigner(sender.signer);

        const submitAt = performance.now();
        const response = await transaction.executeWithSigner(sender.signer);
        const receipt = await response.getReceiptWithSigner(sender.signer);
        const completedAt = performance.now();

        return {
            type: "HBAR_TRANSFER",
            status: receipt.status.toString(),
            latencyMs: completedAt - submitAt,
        };
    }

    async executeTokenTransfer(context) {
        const { accounts, resources } = context;
        const tokenId = resources.tokenId;
        const [sender, receiver] = this.pickDistinctAccounts(accounts);
        const amount = Math.floor(Math.random() * 10) + 1;

        let transaction = await new TransferTransaction()
            .addTokenTransfer(tokenId, sender.accountId, -amount)
            .addTokenTransfer(tokenId, receiver.accountId, amount)
            .freezeWithSigner(sender.signer);

        transaction = await transaction.signWithSigner(sender.signer);

        const submitAt = performance.now();
        const response = await transaction.executeWithSigner(sender.signer);
        const receipt = await response.getReceiptWithSigner(sender.signer);
        const completedAt = performance.now();

        return {
            type: "TOKEN_TRANSFER",
            status: receipt.status.toString(),
            latencyMs: completedAt - submitAt,
        };
    }

    async runStage(stage, context, operations, metrics) {
        const totalTransactions = Math.floor(stage.tps * stage.durationSeconds);
        const intervalMs = stage.tps > 0 ? 1000 / stage.tps : 0;

        metrics.startedAt = performance.now();
        metrics.totalTransactions = totalTransactions;

        await new Promise((resolve) => {
            let completed = 0;

            if (totalTransactions === 0 || this.currentTest?.stopRequested) {
                resolve();
                return;
            }

            for (let i = 0; i < totalTransactions; i++) {
                if (this.currentTest?.stopRequested) break;

                const delayMs = Math.round(i * intervalMs);
                setTimeout(async () => {
                    const operationId = `op-${Date.now()}-${Math.random()}`;
                    this.pendingOperations.add(operationId);

                    try {
                        await this.executeScheduledOperation(context, operations, metrics);
                    } catch (error) {
                        console.error("Operation error:", error.message);
                    } finally {
                        this.pendingOperations.delete(operationId);
                        completed++;
                        if (completed === totalTransactions) {
                            resolve();
                        }
                    }
                }, delayMs);
            }
        });

        metrics.completedAt = performance.now();
    }

    async executeScheduledOperation(context, operations, metrics) {
        const operation = this.pickOperation(operations);
        metrics.submitted++;

        try {
            const result = await operation.handler();
            metrics.success++;

            if (result?.status) {
                metrics.statusCounts[result.status] =
                    (metrics.statusCounts[result.status] || 0) + 1;
            }

            if (result?.latencyMs) {
                metrics.latencyTracker.add(result.latencyMs);
            }
        } catch (error) {
            metrics.failures++;
            const errorKey = error?.status?.toString() || error.message || "UNKNOWN_ERROR";
            metrics.errors[errorKey] = (metrics.errors[errorKey] || 0) + 1;
        }
    }

    pickOperation(operations) {
        const totalWeight = operations.reduce((acc, op) => acc + op.weight, 0);
        const target = Math.random() * totalWeight;

        let cumulative = 0;
        for (const operation of operations) {
            cumulative += operation.weight;
            if (target <= cumulative) {
                return operation;
            }
        }

        return operations[operations.length - 1];
    }

    pickDistinctAccounts(accounts) {
        if (accounts.length < 2) {
            throw new Error("At least two accounts are required");
        }
        const senderIndex = Math.floor(Math.random() * accounts.length);
        let receiverIndex = Math.floor(Math.random() * (accounts.length - 1));
        if (receiverIndex >= senderIndex) {
            receiverIndex++;
        }
        return [accounts[senderIndex], accounts[receiverIndex]];
    }

    pickTransferAmount([min, max]) {
        const value = min + Math.random() * (max - min);
        return Number(value.toFixed(8));
    }

    initTestMetrics() {
        return {
            submitted: 0,
            success: 0,
            failures: 0,
            statusCounts: {},
            errors: {},
            latencyTracker: new LatencyTracker(),
            startedAt: Date.now(),
            completedAt: null
        };
    }

    initStageMetrics(stage, index, stageCount) {
        return {
            stageIndex: index,
            stageCount,
            stage,
            submitted: 0,
            success: 0,
            failures: 0,
            statusCounts: {},
            latencyTracker: new LatencyTracker(),
            errors: {},
            startedAt: null,
            completedAt: null,
            totalTransactions: 0,
        };
    }

    updateTestMetrics(testMetrics, stageMetrics) {
        testMetrics.submitted += stageMetrics.submitted;
        testMetrics.success += stageMetrics.success;
        testMetrics.failures += stageMetrics.failures;

        // Merge status counts
        for (const [status, count] of Object.entries(stageMetrics.statusCounts)) {
            testMetrics.statusCounts[status] =
                (testMetrics.statusCounts[status] || 0) + count;
        }

        // Merge error counts
        for (const [error, count] of Object.entries(stageMetrics.errors)) {
            testMetrics.errors[error] =
                (testMetrics.errors[error] || 0) + count;
        }

        // Add latency samples
        if (stageMetrics.latencyTracker.samples.length > 0) {
            stageMetrics.latencyTracker.samples.forEach(sample => {
                testMetrics.latencyTracker.add(sample);
            });
        }
    }

    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    async start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`Worker ${this.workerId} listening on port ${this.port}`);
        });

        // Register with coordinator
        const registered = await this.registerWithCoordinator();
        if (!registered) {
            console.error('Failed to register with coordinator');
            process.exit(1);
        }

        // Start heartbeat
        setInterval(() => this.sendHeartbeat(), 2000);
    }

    async stop() {
        if (this.isRunning) {
            await this.stopTest();
        }

        return new Promise((resolve) => {
            this.server?.close(() => {
                console.log(`Worker ${this.workerId} stopped`);
                resolve();
            });
        });
    }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const workerId = process.env.WORKER_ID || undefined;
    const coordinatorUrl = process.env.COORDINATOR_URL || 'http://localhost:3000';
    const port = parseInt(process.env.WORKER_PORT || '3001');

    const worker = new LoadTestWorker(workerId, coordinatorUrl, port);

    worker.start().catch(console.error);

    process.on('SIGINT', async () => {
        console.log('\nShutting down worker...');
        await worker.stop();
        process.exit(0);
    });
}

export { LoadTestWorker };