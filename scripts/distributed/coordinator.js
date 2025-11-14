/**
 * Distributed Load Test Coordinator
 * Manages and orchestrates multiple worker nodes for distributed load testing
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetricsAggregator, generateReport, formatNumber } from '../loadTestUtils.js';
import { MetricsStreamer } from './metricsStreamer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LoadTestCoordinator {
    constructor(port = 3000) {
        this.port = port;
        this.workers = new Map();
        this.currentTest = null;
        this.metricsAggregator = new MetricsAggregator();
        this.metricsStreamer = new MetricsStreamer();
        this.dashboardClients = new Set();

        this.app = express();
        this.server = null;
        this.wss = null;

        this.setupRoutes();
    }

    setupRoutes() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, 'dashboard')));

        // Worker registration endpoint
        this.app.post('/api/worker/register', (req, res) => {
            const { workerId, host, capabilities } = req.body;

            this.workers.set(workerId, {
                id: workerId,
                host,
                capabilities,
                status: 'idle',
                lastHeartbeat: Date.now(),
                currentStage: null,
                metrics: null
            });

            console.log(`Worker ${workerId} registered from ${host}`);
            this.broadcastWorkerUpdate();

            res.json({
                success: true,
                workerId,
                message: 'Worker registered successfully'
            });
        });

        // Worker heartbeat endpoint
        this.app.post('/api/worker/heartbeat', (req, res) => {
            const { workerId, status, metrics } = req.body;

            const worker = this.workers.get(workerId);
            if (worker) {
                worker.lastHeartbeat = Date.now();
                worker.status = status;

                if (metrics) {
                    worker.metrics = metrics;
                    this.metricsAggregator.addMetrics(workerId, metrics);
                    this.streamMetrics(workerId, metrics);
                }

                this.broadcastMetricsUpdate();
            }

            res.json({ success: true });
        });

        // Start distributed test endpoint
        this.app.post('/api/test/start', async (req, res) => {
            const { config, workerCount } = req.body;

            if (this.currentTest && this.currentTest.status === 'running') {
                return res.status(400).json({
                    success: false,
                    error: 'Test already in progress'
                });
            }

            try {
                const result = await this.startDistributedTest(config, workerCount);
                res.json({ success: true, testId: result.testId });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Stop test endpoint
        this.app.post('/api/test/stop', async (req, res) => {
            if (!this.currentTest) {
                return res.status(400).json({
                    success: false,
                    error: 'No test in progress'
                });
            }

            await this.stopDistributedTest();
            res.json({ success: true });
        });

        // Get test status endpoint
        this.app.get('/api/test/status', (req, res) => {
            const aggregated = this.metricsAggregator.aggregate();

            res.json({
                testId: this.currentTest?.testId,
                status: this.currentTest?.status || 'idle',
                workers: Array.from(this.workers.values()).map(w => ({
                    id: w.id,
                    host: w.host,
                    status: w.status,
                    online: Date.now() - w.lastHeartbeat < 5000
                })),
                metrics: {
                    ...aggregated,
                    workerCount: this.workers.size,
                    activeWorkers: Array.from(this.workers.values())
                        .filter(w => w.status === 'running').length
                }
            });
        });

        // Get aggregated metrics endpoint
        this.app.get('/api/metrics', (req, res) => {
            const aggregated = this.metricsAggregator.aggregate();
            res.json(aggregated);
        });

        // Dashboard endpoint
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
        });
    }

    async startDistributedTest(config, workerCount) {
        const availableWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'idle' && Date.now() - w.lastHeartbeat < 5000);

        if (availableWorkers.length < workerCount) {
            throw new Error(
                `Not enough workers available. Required: ${workerCount}, Available: ${availableWorkers.length}`
            );
        }

        const testId = `test-${Date.now()}`;
        const selectedWorkers = availableWorkers.slice(0, workerCount);

        this.currentTest = {
            testId,
            status: 'running',
            config,
            startTime: Date.now(),
            workers: selectedWorkers.map(w => w.id)
        };

        // Clear previous metrics
        this.metricsAggregator = new MetricsAggregator();

        // Distribute configuration to workers
        const promises = selectedWorkers.map(async (worker) => {
            const workerConfig = this.distributeConfig(config, workerCount, worker.id);
            return this.sendToWorker(worker, 'start', { config: workerConfig, testId });
        });

        await Promise.all(promises);

        console.log(`Started distributed test ${testId} with ${workerCount} workers`);
        this.broadcastTestUpdate();

        return { testId, workers: selectedWorkers.map(w => w.id) };
    }

    distributeConfig(config, workerCount, workerId) {
        // Distribute load evenly across workers
        const workerConfig = { ...config };

        // Adjust TPS for each worker
        workerConfig.stages = config.stages.map(stage => ({
            ...stage,
            tps: Math.ceil(stage.tps / workerCount)
        }));

        // Reduce account pool size per worker
        workerConfig.accountPoolSize = Math.ceil(config.accountPoolSize / workerCount);

        // Add worker identification
        workerConfig.workerId = workerId;
        workerConfig.totalWorkers = workerCount;

        return workerConfig;
    }

    async sendToWorker(worker, action, data) {
        try {
            const response = await fetch(`http://${worker.host}/api/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Worker ${worker.id} returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Failed to send ${action} to worker ${worker.id}:`, error);
            worker.status = 'error';
            throw error;
        }
    }

    async stopDistributedTest() {
        if (!this.currentTest) return;

        const promises = this.currentTest.workers.map(workerId => {
            const worker = this.workers.get(workerId);
            if (worker) {
                return this.sendToWorker(worker, 'stop', {});
            }
        });

        await Promise.allSettled(promises);

        // Generate final report
        const aggregated = this.metricsAggregator.aggregate();
        const report = generateReport(aggregated);

        // Save results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `distributed-test-${timestamp}.json`;
        await fs.promises.writeFile(
            filename,
            JSON.stringify({
                testId: this.currentTest.testId,
                config: this.currentTest.config,
                results: aggregated,
                report
            }, null, 2)
        );

        console.log(`Test stopped. Results saved to ${filename}`);
        console.log(report);

        this.currentTest = null;
        this.broadcastTestUpdate();
    }

    streamMetrics(workerId, metrics) {
        // Stream to Prometheus
        if (this.metricsStreamer.prometheusEnabled) {
            this.metricsStreamer.streamToPrometheus({
                ...metrics,
                workerId
            });
        }

        // Stream to StatsD
        if (this.metricsStreamer.statsdEnabled) {
            this.metricsStreamer.streamToStatsD({
                ...metrics,
                workerId
            });
        }
    }

    broadcastWorkerUpdate() {
        this.broadcast({
            type: 'workerUpdate',
            workers: Array.from(this.workers.values()).map(w => ({
                id: w.id,
                host: w.host,
                status: w.status,
                online: Date.now() - w.lastHeartbeat < 5000
            }))
        });
    }

    broadcastMetricsUpdate() {
        const aggregated = this.metricsAggregator.aggregate();

        this.broadcast({
            type: 'metricsUpdate',
            metrics: {
                ...aggregated,
                timestamp: Date.now()
            }
        });
    }

    broadcastTestUpdate() {
        this.broadcast({
            type: 'testUpdate',
            test: this.currentTest ? {
                testId: this.currentTest.testId,
                status: this.currentTest.status,
                startTime: this.currentTest.startTime
            } : null
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.dashboardClients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(data);
            }
        });
    }

    async start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`Load Test Coordinator running on port ${this.port}`);
            console.log(`Dashboard available at http://localhost:${this.port}`);
        });

        // Setup WebSocket server for dashboard
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws) => {
            this.dashboardClients.add(ws);
            console.log('Dashboard client connected');

            // Send initial state
            this.broadcastWorkerUpdate();
            this.broadcastTestUpdate();
            this.broadcastMetricsUpdate();

            ws.on('close', () => {
                this.dashboardClients.delete(ws);
                console.log('Dashboard client disconnected');
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleDashboardMessage(data, ws);
                } catch (error) {
                    console.error('Invalid dashboard message:', error);
                }
            });
        });

        // Periodic worker health check
        setInterval(() => {
            let changed = false;
            this.workers.forEach((worker, workerId) => {
                const wasOnline = worker.status !== 'offline';
                const isOnline = Date.now() - worker.lastHeartbeat < 5000;

                if (wasOnline && !isOnline) {
                    worker.status = 'offline';
                    changed = true;
                    console.log(`Worker ${workerId} went offline`);
                }
            });

            if (changed) {
                this.broadcastWorkerUpdate();
            }
        }, 5000);

        // Initialize metrics streaming
        await this.metricsStreamer.initialize();
    }

    handleDashboardMessage(data, ws) {
        switch (data.type) {
            case 'startTest':
                this.startDistributedTest(data.config, data.workerCount)
                    .then(result => {
                        ws.send(JSON.stringify({
                            type: 'testStarted',
                            testId: result.testId
                        }));
                    })
                    .catch(error => {
                        ws.send(JSON.stringify({
                            type: 'error',
                            error: error.message
                        }));
                    });
                break;

            case 'stopTest':
                this.stopDistributedTest()
                    .then(() => {
                        ws.send(JSON.stringify({
                            type: 'testStopped'
                        }));
                    });
                break;

            case 'getConfig':
                ws.send(JSON.stringify({
                    type: 'config',
                    config: this.currentTest?.config || null
                }));
                break;
        }
    }

    async stop() {
        if (this.currentTest) {
            await this.stopDistributedTest();
        }

        this.wss?.close();

        return new Promise((resolve) => {
            this.server?.close(() => {
                console.log('Coordinator stopped');
                resolve();
            });
        });
    }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const coordinator = new LoadTestCoordinator(process.env.COORDINATOR_PORT || 3000);

    coordinator.start().catch(console.error);

    process.on('SIGINT', async () => {
        console.log('\nShutting down coordinator...');
        await coordinator.stop();
        process.exit(0);
    });
}

export { LoadTestCoordinator };