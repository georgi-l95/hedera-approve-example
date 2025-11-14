import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "node:perf_hooks";
import {
    Hbar,
    TransferTransaction,
    TokenMintTransaction,
    NftId,
} from "@hashgraph/sdk";
import readline from "node:readline";
import { Utils } from "./utils.js";

dotenv.config();

const DEFAULT_CONFIG = {
    accountPoolSize: 10,
    accountInitialBalanceHbar: 10,
    transferAmountHbarRange: [0.0001, 0.001],
    tokenTransferAmount: [1, 10],
    enableTokenOperations: false,
    enableNFTOperations: false,
    operationWeights: {
        HBAR_TRANSFER: 10,
        TOKEN_TRANSFER: 3,
        NFT_TRANSFER: 2,
        TOKEN_APPROVAL: 1,
    },
    retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        retriableStatuses: ["BUSY", "PLATFORM_NOT_ACTIVE", "THROTTLED_AT_CONSENSUS"]
    },
    stages: [
        { tps: 10, durationSeconds: 120 },
        { tps: 20, durationSeconds: 120 },
        { tps: 50, durationSeconds: 120 },
        { tps: 100, durationSeconds: 120 },
        { tps: 250, durationSeconds: 120 },
        { tps: 500, durationSeconds: 120 },
    ],
};

// Latency percentile tracking
class LatencyTracker {
    constructor(maxSamples = 10000) {
        this.samples = [];
        this.maxSamples = maxSamples;
        this.min = Number.POSITIVE_INFINITY;
        this.max = 0;
        this.total = 0;
        this.count = 0;
    }

    add(latency) {
        this.samples.push(latency);
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        this.min = Math.min(this.min, latency);
        this.max = Math.max(this.max, latency);
        this.total += latency;
        this.count++;
    }

    getPercentiles() {
        if (this.samples.length === 0) return {};

        const sorted = [...this.samples].sort((a, b) => a - b);
        const p50Index = Math.floor(sorted.length * 0.5);
        const p95Index = Math.floor(sorted.length * 0.95);
        const p99Index = Math.floor(sorted.length * 0.99);

        return {
            p50: sorted[p50Index],
            p95: sorted[p95Index],
            p99: sorted[p99Index],
            min: this.min,
            max: this.max,
            avg: this.count > 0 ? this.total / this.count : 0,
            samples: this.count
        };
    }
}

// Graceful shutdown handling
let isShuttingDown = false;
let currentMetrics = null;
let pendingOperations = new Set();

process.on('SIGINT', async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n\nGracefully shutting down...');

    // Wait for pending operations with timeout
    const timeout = setTimeout(() => {
        console.log('Timeout waiting for operations, forcing exit...');
        process.exit(1);
    }, 10000);

    while (pendingOperations.size > 0 && !isShuttingDown) {
        console.log(`Waiting for ${pendingOperations.size} operations to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    clearTimeout(timeout);

    // Save partial results
    if (currentMetrics) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `loadtest-partial-${timestamp}.json`;
        await exportMetrics(currentMetrics, filename);
        console.log(`Partial results saved to ${filename}`);
    }

    process.exit(0);
});

async function main() {
    validateEnv();

    const config = await loadConfig();
    validateConfiguration(config);

    const client = Utils.initClient();
    const wallet = Utils.initWallet(
        process.env.OPERATOR_ID,
        process.env.OPERATOR_KEY,
        client
    );

    console.log("Preparing account pool...");
    const accounts = await createAccountPool(
        wallet,
        client,
        config.accountPoolSize,
        config.accountInitialBalanceHbar
    );

    const context = {
        wallet,
        accounts,
        config,
        client,
        resources: {}
    };

    // Pre-warm resources if needed
    if (config.enableTokenOperations || config.enableNFTOperations) {
        console.log("Pre-warming resources (tokens, NFTs, associations)...");
        await prewarmResources(context);
    }

    console.log(
        `Account pool ready with ${accounts.length} funded accounts. Starting scenario.`
    );

    const operations = buildOperations(context);
    const stageMetrics = [];

    for (let index = 0; index < config.stages.length; index += 1) {
        if (isShuttingDown) break;

        const stage = config.stages[index];
        console.log(
            `\nStage ${index + 1}/${config.stages.length}: ${stage.tps} TPS for ${
                stage.durationSeconds
            }s`
        );
        const metrics = initStageMetrics(stage, index, config.stages.length);
        currentMetrics = metrics;
        stageMetrics.push(metrics);
        await runStage(stage, context, operations, metrics);
        printStageSummary(metrics);
    }

    if (!isShuttingDown) {
        printScenarioSummary(stageMetrics);

        // Export final metrics
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonFilename = `loadtest-results-${timestamp}.json`;
        const csvFilename = `loadtest-results-${timestamp}.csv`;

        await exportMetrics(stageMetrics, jsonFilename);
        await exportMetricsCSV(stageMetrics, csvFilename);

        console.log(`\nResults exported to:`);
        console.log(`  - JSON: ${jsonFilename}`);
        console.log(`  - CSV: ${csvFilename}`);
    }
}

function validateEnv() {
    if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
        throw new Error(
            "Environment variables OPERATOR_ID and OPERATOR_KEY are required."
        );
    }
}

function validateConfiguration(config) {
    const errors = [];

    if (config.accountPoolSize < 2) {
        errors.push("accountPoolSize must be at least 2 for transfers");
    }

    if (config.accountInitialBalanceHbar < 1) {
        errors.push("accountInitialBalanceHbar should be at least 1 HBAR");
    }

    const [minTransfer, maxTransfer] = config.transferAmountHbarRange;
    if (minTransfer <= 0 || maxTransfer <= 0 || minTransfer > maxTransfer) {
        errors.push("Invalid transferAmountHbarRange");
    }

    // Estimate costs
    for (let i = 0; i < config.stages.length; i++) {
        const stage = config.stages[i];

        if (stage.tps <= 0) {
            errors.push(`Stage ${i + 1}: TPS must be positive`);
        }

        if (stage.durationSeconds <= 0) {
            errors.push(`Stage ${i + 1}: Duration must be positive`);
        }

        if (stage.tps > 1000) {
            console.warn(`Warning: Stage ${i + 1} TPS of ${stage.tps} might exceed network limits`);
        }

        const totalTransactions = stage.tps * stage.durationSeconds;
        const estimatedCostHbar = totalTransactions * 0.001; // Conservative estimate
        const totalFunds = config.accountPoolSize * config.accountInitialBalanceHbar;

        if (estimatedCostHbar > totalFunds * 0.5) {
            console.warn(
                `Warning: Stage ${i + 1} (${stage.tps} TPS for ${stage.durationSeconds}s) ` +
                `might consume significant funds (est. ${estimatedCostHbar.toFixed(2)} HBAR)`
            );
        }
    }

    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n  ${errors.join('\n  ')}`);
    }

    console.log("Configuration validated successfully.");
}

async function loadConfig() {
    const [, , providedPath] = process.argv;

    if (!providedPath) {
        return DEFAULT_CONFIG;
    }

    const resolvedPath = resolvePathRelativeToModule(
        providedPath,
        import.meta.url
    );

    const buffer = await fs.promises.readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(buffer);

    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        operationWeights: {
            ...DEFAULT_CONFIG.operationWeights,
            ...(parsed.operationWeights || {})
        },
        retryConfig: {
            ...DEFAULT_CONFIG.retryConfig,
            ...(parsed.retryConfig || {})
        },
        stages: parsed.stages ?? DEFAULT_CONFIG.stages,
    };
}

function resolvePathRelativeToModule(relativePath, moduleUrl) {
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    return path.join(moduleDir, relativePath);
}

async function createAccountPool(wallet, client, size, initialBalanceHbar) {
    const accounts = [];
    for (let i = 0; i < size; i += 1) {
        const account = await Utils.createAccount(wallet, initialBalanceHbar);
        const signer = Utils.initWallet(
            account.accountId,
            account.accountKey,
            client
        );
        accounts.push({
            label: `account-${i}`,
            ...account,
            signer,
        });
    }
    return accounts;
}

async function prewarmResources(context) {
    const { wallet, accounts, config } = context;

    if (config.enableTokenOperations) {
        console.log("  Creating fungible token...");
        const tokenId = await Utils.createHTSToken(wallet);
        context.resources.tokenId = tokenId;

        console.log("  Associating token with accounts...");
        for (const account of accounts) {
            await Utils.tokenAssociate(
                wallet,
                account.accountId,
                account.accountKey,
                [tokenId]
            );

            // Distribute some tokens
            const amount = Math.floor(50 / accounts.length);
            if (amount > 0) {
                await Utils.transferToken(
                    wallet,
                    account.accountId,
                    tokenId,
                    amount
                );
            }
        }
    }

    if (config.enableNFTOperations) {
        console.log("  Creating NFT collection...");
        const nftTokenId = await Utils.createNFTToken(wallet);
        context.resources.nftTokenId = nftTokenId;

        console.log("  Minting NFTs...");
        const nfts = await Utils.mintNFT(wallet, nftTokenId);
        context.resources.nfts = nfts;
        context.resources.nftSerials = nfts.map(nft => nft.serials[0]);

        console.log("  Associating NFT token with accounts...");
        for (const account of accounts) {
            await Utils.tokenAssociate(
                wallet,
                account.accountId,
                account.accountKey,
                [nftTokenId]
            );
        }

        // Distribute NFTs to some accounts
        for (let i = 0; i < Math.min(nfts.length, accounts.length); i++) {
            const nftSerial = nfts[i].serials[0];
            await new TransferTransaction()
                .addNftTransfer(
                    nftTokenId,
                    nftSerial,
                    wallet.getAccountId(),
                    accounts[i].accountId
                )
                .freezeWithSigner(wallet)
                .then(tx => tx.signWithSigner(wallet))
                .then(tx => tx.executeWithSigner(wallet))
                .then(resp => resp.getReceiptWithSigner(wallet));

            accounts[i].ownedNft = { tokenId: nftTokenId, serial: nftSerial };
        }
    }

    console.log("  Resource pre-warming complete.");
}

function buildOperations(context) {
    const { config } = context;
    const operations = [];
    const weights = config.operationWeights;

    // Always include HBAR transfers
    operations.push({
        type: "HBAR_TRANSFER",
        weight: weights.HBAR_TRANSFER || 10,
        handler: () => executeHbarTransfer(context, config),
    });

    // Add token operations if enabled
    if (config.enableTokenOperations && context.resources.tokenId) {
        operations.push({
            type: "TOKEN_TRANSFER",
            weight: weights.TOKEN_TRANSFER || 3,
            handler: () => executeTokenTransfer(context, config),
        });

        operations.push({
            type: "TOKEN_APPROVAL",
            weight: weights.TOKEN_APPROVAL || 1,
            handler: () => executeTokenApproval(context, config),
        });
    }

    // Add NFT operations if enabled
    if (config.enableNFTOperations && context.resources.nftTokenId) {
        operations.push({
            type: "NFT_TRANSFER",
            weight: weights.NFT_TRANSFER || 2,
            handler: () => executeNFTTransfer(context, config),
        });
    }

    console.log(`Configured operations: ${operations.map(op => `${op.type}(${op.weight})`).join(', ')}`);
    return operations;
}

async function executeWithRetry(operation, config) {
    const { maxRetries, backoffMs, retriableStatuses } = config.retryConfig;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            const errorStatus = error?.status?.toString();
            const isRetriable = retriableStatuses.includes(errorStatus);

            if (isRetriable && attempt < maxRetries - 1) {
                const delay = backoffMs * Math.pow(2, attempt); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

async function executeHbarTransfer(context, config) {
    const { wallet, accounts } = context;
    const [sender, receiver] = pickDistinctAccounts(accounts);
    const amount = pickTransferAmount(config.transferAmountHbarRange);
    const amountHbar = new Hbar(amount);

    const operation = async () => {
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
    };

    return executeWithRetry(operation, config);
}

async function executeTokenTransfer(context, config) {
    const { accounts, resources } = context;
    const tokenId = resources.tokenId;

    if (!tokenId) {
        throw new Error("No token available for transfer");
    }

    const [sender, receiver] = pickDistinctAccounts(accounts);
    const [minAmount, maxAmount] = config.tokenTransferAmount;
    const amount = Math.floor(minAmount + Math.random() * (maxAmount - minAmount));

    const operation = async () => {
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
    };

    return executeWithRetry(operation, config);
}

async function executeNFTTransfer(context, config) {
    const { accounts, resources } = context;
    const nftTokenId = resources.nftTokenId;

    if (!nftTokenId) {
        throw new Error("No NFT token available for transfer");
    }

    // Find accounts with NFTs
    const sendersWithNfts = accounts.filter(acc => acc.ownedNft);
    if (sendersWithNfts.length === 0) {
        throw new Error("No accounts own NFTs for transfer");
    }

    const sender = sendersWithNfts[Math.floor(Math.random() * sendersWithNfts.length)];
    const receivers = accounts.filter(acc => acc.accountId !== sender.accountId);
    const receiver = receivers[Math.floor(Math.random() * receivers.length)];

    const nftSerial = sender.ownedNft.serial;

    const operation = async () => {
        let transaction = await new TransferTransaction()
            .addNftTransfer(nftTokenId, nftSerial, sender.accountId, receiver.accountId)
            .freezeWithSigner(sender.signer);

        transaction = await transaction.signWithSigner(sender.signer);

        const submitAt = performance.now();
        const response = await transaction.executeWithSigner(sender.signer);
        const receipt = await response.getReceiptWithSigner(sender.signer);
        const completedAt = performance.now();

        // Update ownership tracking
        delete sender.ownedNft;
        receiver.ownedNft = { tokenId: nftTokenId, serial: nftSerial };

        return {
            type: "NFT_TRANSFER",
            status: receipt.status.toString(),
            latencyMs: completedAt - submitAt,
        };
    };

    return executeWithRetry(operation, config);
}

async function executeTokenApproval(context, config) {
    const { wallet, accounts, resources } = context;
    const tokenId = resources.tokenId;

    if (!tokenId) {
        throw new Error("No token available for approval");
    }

    const [owner, spender] = pickDistinctAccounts(accounts);
    const [minAmount, maxAmount] = config.tokenTransferAmount;
    const amount = Math.floor(minAmount + Math.random() * (maxAmount - minAmount));

    const operation = async () => {
        const submitAt = performance.now();

        await Utils.approveToken(
            wallet,
            owner,
            spender.accountId.toString().split('.')[2],
            tokenId,
            amount
        );

        const completedAt = performance.now();

        return {
            type: "TOKEN_APPROVAL",
            status: "SUCCESS",
            latencyMs: completedAt - submitAt,
        };
    };

    return executeWithRetry(operation, config);
}

function pickDistinctAccounts(accounts) {
    if (accounts.length < 2) {
        throw new Error("At least two accounts are required for transfers.");
    }
    const senderIndex = Math.floor(Math.random() * accounts.length);
    let receiverIndex = Math.floor(Math.random() * (accounts.length - 1));
    if (receiverIndex >= senderIndex) {
        receiverIndex += 1;
    }
    return [accounts[senderIndex], accounts[receiverIndex]];
}

function pickTransferAmount([min, max]) {
    const value = min + Math.random() * (max - min);
    return Number(value.toFixed(8));
}

async function runStage(stage, context, operations, metrics) {
    const totalTransactions = Math.floor(stage.tps * stage.durationSeconds);
    const intervalMs = stage.tps > 0 ? 1000 / stage.tps : 0;

    metrics.startedAt = performance.now();
    metrics.totalTransactions = totalTransactions;

    const progressTimer = startStageProgress(metrics);

    await new Promise((resolve) => {
        let completed = 0;

        if (totalTransactions === 0 || isShuttingDown) {
            resolve();
            return;
        }

        for (let i = 0; i < totalTransactions; i += 1) {
            if (isShuttingDown) break;

            const delayMs = Math.round(i * intervalMs);
            setTimeout(async () => {
                if (isShuttingDown) {
                    completed += 1;
                    if (completed === totalTransactions) {
                        resolve();
                    }
                    return;
                }

                const operationId = `op-${Date.now()}-${Math.random()}`;
                pendingOperations.add(operationId);

                try {
                    await executeScheduledOperation(context, operations, metrics);
                } catch (error) {
                    console.error("Unhandled error executing operation:", error);
                } finally {
                    pendingOperations.delete(operationId);
                    completed += 1;
                    if (completed === totalTransactions) {
                        resolve();
                    }
                }
            }, delayMs);
        }
    });

    metrics.completedAt = performance.now();

    if (progressTimer) {
        clearInterval(progressTimer);
        renderStageProgress(metrics);
        finishStageProgress();
    }
}

async function executeScheduledOperation(context, operations, metrics) {
    const operation = pickOperation(operations);
    metrics.submitted += 1;

    const typeMetrics = metrics.perType[operation.type] ?? initPerTypeMetrics();
    metrics.perType[operation.type] = typeMetrics;
    typeMetrics.submitted += 1;

    const startedAt = performance.now();

    try {
        const result = await operation.handler();
        const latency = result.latencyMs ?? performance.now() - startedAt;

        metrics.success += 1;
        typeMetrics.success += 1;

        if (result?.status != null) {
            metrics.statusCounts[result.status] =
                (metrics.statusCounts[result.status] ?? 0) + 1;
        }

        metrics.latencyTracker.add(latency);
        typeMetrics.latencyTracker.add(latency);

    } catch (error) {
        const latency = performance.now() - startedAt;
        metrics.failures += 1;
        typeMetrics.failures += 1;

        metrics.latencyTracker.add(latency);
        typeMetrics.latencyTracker.add(latency);

        const errorKey = extractErrorKey(error);
        metrics.errors[errorKey] = (metrics.errors[errorKey] ?? 0) + 1;
    }
}

function pickOperation(operations) {
    const totalWeight = operations.reduce(
        (acc, current) => acc + current.weight,
        0
    );
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

function initStageMetrics(stage, index, stageCount) {
    return {
        stageIndex: index,
        stageCount,
        stage,
        submitted: 0,
        success: 0,
        failures: 0,
        statusCounts: {},
        latencyTracker: new LatencyTracker(),
        perType: {},
        errors: {},
        startedAt: null,
        completedAt: null,
        totalTransactions: 0,
    };
}

function initPerTypeMetrics() {
    return {
        submitted: 0,
        success: 0,
        failures: 0,
        latencyTracker: new LatencyTracker(),
    };
}

function extractErrorKey(error) {
    if (error?.status != null) {
        return error.status.toString();
    }
    if (error?.message != null) {
        return error.message.split("\n")[0];
    }
    return "UNKNOWN_ERROR";
}

function startStageProgress(metrics) {
    if (!process.stdout.isTTY || (metrics.totalTransactions ?? 0) === 0) {
        return null;
    }
    renderStageProgress(metrics);
    return setInterval(() => renderStageProgress(metrics), 500);
}

function renderStageProgress(metrics) {
    if (!process.stdout.isTTY) {
        return;
    }

    const total = metrics.totalTransactions ?? 0;
    const processed = metrics.success + metrics.failures;
    const percent =
        total > 0 ? Math.min((processed / total) * 100, 100) : 100;
    const pending = Math.max(metrics.submitted - processed, 0);

    const elapsedMs = metrics.startedAt
        ? performance.now() - metrics.startedAt
        : 0;
    const elapsedSeconds = elapsedMs / 1000;
    const rate = elapsedSeconds > 0 ? processed / elapsedSeconds : 0;

    let etaSeconds = 0;
    if (metrics.stage?.durationSeconds != null) {
        etaSeconds = Math.max(
            metrics.stage.durationSeconds - elapsedSeconds,
            0
        );
    } else if (metrics.stage?.tps > 0) {
        const remaining = Math.max(total - processed, 0);
        etaSeconds = remaining / metrics.stage.tps;
    }

    const stageCount = metrics.stageCount || "?";

    const line = [
        `Stage ${metrics.stageIndex + 1}/${stageCount}`,
        `${processed}/${total} (${percent.toFixed(1)}%)`,
        `succ ${metrics.success}`,
        `fail ${metrics.failures}`,
        `in-flight ${pending}`,
        `rate ${rate.toFixed(1)} tx/s`,
        `eta ${etaSeconds.toFixed(0)}s`,
    ].join(" | ");

    clearProgressLine();
    process.stdout.write(line);
}

function finishStageProgress() {
    if (!process.stdout.isTTY) {
        return;
    }
    clearProgressLine();
    process.stdout.write("\n");
}

function clearProgressLine() {
    if (!process.stdout.isTTY) {
        return;
    }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
}

function printStageSummary(metrics) {
    const { stage, success, failures, submitted } = metrics;
    const latencyStats = metrics.latencyTracker.getPercentiles();

    const processed = success + failures;
    const durationSeconds =
        metrics.completedAt && metrics.startedAt
            ? (metrics.completedAt - metrics.startedAt) / 1000
            : stage.durationSeconds ?? 0;
    const actualRate =
        durationSeconds > 0 ? processed / durationSeconds : 0;

    console.log(
        `Stage ${metrics.stageIndex + 1}: submitted=${submitted}, success=${success}, failures=${failures}`
    );
    console.log(
        `  Latency (ms): avg=${latencyStats.avg?.toFixed(2) || 'n/a'}, ` +
        `p50=${latencyStats.p50?.toFixed(2) || 'n/a'}, ` +
        `p95=${latencyStats.p95?.toFixed(2) || 'n/a'}, ` +
        `p99=${latencyStats.p99?.toFixed(2) || 'n/a'}, ` +
        `min=${latencyStats.min?.toFixed(2) || 'n/a'}, ` +
        `max=${latencyStats.max?.toFixed(2) || 'n/a'}`
    );
    console.log(
        `  Throughput: target=${stage.tps} TPS, actual=${actualRate.toFixed(
            1
        )} TPS over ${durationSeconds.toFixed(1)}s`
    );

    if (Object.keys(metrics.errors).length > 0) {
        console.log("  Errors:");
        for (const [code, count] of Object.entries(metrics.errors)) {
            console.log(`    ${code}: ${count}`);
        }
    }

    if (Object.keys(metrics.statusCounts).length > 0) {
        console.log("  Statuses:");
        for (const [status, count] of Object.entries(metrics.statusCounts)) {
            console.log(`    ${status}: ${count}`);
        }
    }

    console.log("  Breakdown:");
    for (const [type, values] of Object.entries(metrics.perType)) {
        const typeStats = values.latencyTracker.getPercentiles();
        console.log(
            `    ${type}: submitted=${values.submitted}, success=${values.success}, failures=${values.failures}, ` +
            `avgLatency=${typeStats.avg?.toFixed(2) || 'n/a'}ms, ` +
            `p95=${typeStats.p95?.toFixed(2) || 'n/a'}ms`
        );
    }
}

function printScenarioSummary(stageMetrics) {
    const totals = stageMetrics.reduce(
        (acc, metrics) => {
            acc.submitted += metrics.submitted;
            acc.success += metrics.success;
            acc.failures += metrics.failures;
            return acc;
        },
        { submitted: 0, success: 0, failures: 0 }
    );

    console.log("\nScenario complete.");
    console.log(
        `Total submitted=${totals.submitted}, success=${totals.success}, failures=${totals.failures}`
    );

    const successRate = totals.submitted > 0
        ? (totals.success / totals.submitted * 100).toFixed(2)
        : 0;
    console.log(`Overall success rate: ${successRate}%`);
}

async function exportMetrics(metrics, filename) {
    const exportData = Array.isArray(metrics) ? metrics : [metrics];

    // Convert latency trackers to serializable format
    const serializableData = exportData.map(stage => ({
        ...stage,
        latencyStats: stage.latencyTracker?.getPercentiles() || {},
        latencyTracker: undefined, // Remove the tracker itself
        perType: Object.entries(stage.perType || {}).reduce((acc, [type, data]) => {
            acc[type] = {
                ...data,
                latencyStats: data.latencyTracker?.getPercentiles() || {},
                latencyTracker: undefined
            };
            return acc;
        }, {})
    }));

    await fs.promises.writeFile(
        filename,
        JSON.stringify(serializableData, null, 2)
    );
}

async function exportMetricsCSV(stageMetrics, filename) {
    const rows = [];

    // Header
    rows.push([
        'Stage',
        'Target TPS',
        'Duration (s)',
        'Submitted',
        'Success',
        'Failures',
        'Success Rate (%)',
        'Actual TPS',
        'Avg Latency (ms)',
        'P50 Latency (ms)',
        'P95 Latency (ms)',
        'P99 Latency (ms)',
        'Min Latency (ms)',
        'Max Latency (ms)'
    ].join(','));

    // Data rows
    for (const metrics of stageMetrics) {
        const latencyStats = metrics.latencyTracker.getPercentiles();
        const durationSeconds = metrics.completedAt && metrics.startedAt
            ? (metrics.completedAt - metrics.startedAt) / 1000
            : metrics.stage.durationSeconds ?? 0;
        const actualTps = durationSeconds > 0
            ? (metrics.success + metrics.failures) / durationSeconds
            : 0;
        const successRate = metrics.submitted > 0
            ? (metrics.success / metrics.submitted * 100)
            : 0;

        rows.push([
            metrics.stageIndex + 1,
            metrics.stage.tps,
            metrics.stage.durationSeconds,
            metrics.submitted,
            metrics.success,
            metrics.failures,
            successRate.toFixed(2),
            actualTps.toFixed(2),
            latencyStats.avg?.toFixed(2) || '',
            latencyStats.p50?.toFixed(2) || '',
            latencyStats.p95?.toFixed(2) || '',
            latencyStats.p99?.toFixed(2) || '',
            latencyStats.min?.toFixed(2) || '',
            latencyStats.max?.toFixed(2) || ''
        ].join(','));
    }

    await fs.promises.writeFile(filename, rows.join('\n'));
}

main().catch((error) => {
    console.error("Load test aborted:", error);
    process.exit(1);
});