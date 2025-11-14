/**
 * Metrics Streaming Module
 * Streams real-time metrics to various monitoring systems (Prometheus, StatsD, etc.)
 */

import StatsD from 'node-statsd';
import promClient from 'prom-client';
import express from 'express';

class MetricsStreamer {
    constructor(config = {}) {
        this.config = {
            prometheus: {
                enabled: config.prometheus?.enabled || process.env.PROMETHEUS_ENABLED === 'true',
                port: config.prometheus?.port || parseInt(process.env.PROMETHEUS_PORT || '9090'),
                prefix: config.prometheus?.prefix || 'hedera_loadtest_'
            },
            statsd: {
                enabled: config.statsd?.enabled || process.env.STATSD_ENABLED === 'true',
                host: config.statsd?.host || process.env.STATSD_HOST || 'localhost',
                port: config.statsd?.port || parseInt(process.env.STATSD_PORT || '8125'),
                prefix: config.statsd?.prefix || 'hedera.loadtest.'
            },
            customEndpoints: config.customEndpoints || []
        };

        this.prometheusEnabled = this.config.prometheus.enabled;
        this.statsdEnabled = this.config.statsd.enabled;

        this.prometheusMetrics = {};
        this.statsdClient = null;
        this.prometheusApp = null;
        this.prometheusServer = null;
    }

    async initialize() {
        // Initialize Prometheus
        if (this.prometheusEnabled) {
            await this.initializePrometheus();
        }

        // Initialize StatsD
        if (this.statsdEnabled) {
            this.initializeStatsD();
        }

        console.log(`Metrics streaming initialized:`);
        if (this.prometheusEnabled) {
            console.log(`  - Prometheus: http://localhost:${this.config.prometheus.port}/metrics`);
        }
        if (this.statsdEnabled) {
            console.log(`  - StatsD: ${this.config.statsd.host}:${this.config.statsd.port}`);
        }
    }

    async initializePrometheus() {
        const { prefix } = this.config.prometheus;

        // Create Prometheus metrics
        this.prometheusMetrics = {
            // Counter metrics
            transactionsTotal: new promClient.Counter({
                name: `${prefix}transactions_total`,
                help: 'Total number of transactions submitted',
                labelNames: ['worker', 'type', 'stage']
            }),

            transactionsSuccess: new promClient.Counter({
                name: `${prefix}transactions_success`,
                help: 'Total number of successful transactions',
                labelNames: ['worker', 'type', 'stage']
            }),

            transactionsFailed: new promClient.Counter({
                name: `${prefix}transactions_failed`,
                help: 'Total number of failed transactions',
                labelNames: ['worker', 'type', 'stage', 'error']
            }),

            // Gauge metrics
            currentTps: new promClient.Gauge({
                name: `${prefix}current_tps`,
                help: 'Current transactions per second',
                labelNames: ['worker', 'stage']
            }),

            activeWorkers: new promClient.Gauge({
                name: `${prefix}active_workers`,
                help: 'Number of active workers'
            }),

            accountPoolSize: new promClient.Gauge({
                name: `${prefix}account_pool_size`,
                help: 'Size of the account pool',
                labelNames: ['worker']
            }),

            // Histogram metrics
            latency: new promClient.Histogram({
                name: `${prefix}latency_ms`,
                help: 'Transaction latency in milliseconds',
                labelNames: ['worker', 'type', 'stage'],
                buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
            }),

            // Summary metrics
            latencySummary: new promClient.Summary({
                name: `${prefix}latency_summary_ms`,
                help: 'Transaction latency summary',
                labelNames: ['worker', 'type', 'stage'],
                percentiles: [0.5, 0.95, 0.99],
                maxAgeSeconds: 600,
                ageBuckets: 5
            })
        };

        // Register all metrics
        promClient.register.clear();
        Object.values(this.prometheusMetrics).forEach(metric => {
            promClient.register.registerMetric(metric);
        });

        // Setup Prometheus endpoint
        this.prometheusApp = express();

        this.prometheusApp.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', promClient.register.contentType);
                const metrics = await promClient.register.metrics();
                res.end(metrics);
            } catch (error) {
                res.status(500).end(error.message);
            }
        });

        this.prometheusApp.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });

        // Start Prometheus server
        return new Promise((resolve) => {
            this.prometheusServer = this.prometheusApp.listen(
                this.config.prometheus.port,
                () => {
                    console.log(`Prometheus metrics endpoint started on port ${this.config.prometheus.port}`);
                    resolve();
                }
            );
        });
    }

    initializeStatsD() {
        this.statsdClient = new StatsD({
            host: this.config.statsd.host,
            port: this.config.statsd.port,
            prefix: this.config.statsd.prefix,
            errorHandler: (error) => {
                console.error('StatsD error:', error);
            }
        });

        console.log(`StatsD client initialized for ${this.config.statsd.host}:${this.config.statsd.port}`);
    }

    /**
     * Stream metrics to Prometheus
     */
    streamToPrometheus(metrics) {
        if (!this.prometheusEnabled || !this.prometheusMetrics) return;

        const {
            workerId = 'unknown',
            stage = 'unknown',
            submitted = 0,
            success = 0,
            failures = 0,
            latencies = [],
            latencyStats = {},
            errors = {},
            currentTps = 0
        } = metrics;

        // Update counters
        if (submitted > 0) {
            this.prometheusMetrics.transactionsTotal.inc(
                { worker: workerId, type: 'all', stage },
                submitted
            );
        }

        if (success > 0) {
            this.prometheusMetrics.transactionsSuccess.inc(
                { worker: workerId, type: 'all', stage },
                success
            );
        }

        if (failures > 0) {
            this.prometheusMetrics.transactionsFailed.inc(
                { worker: workerId, type: 'all', stage, error: 'all' },
                failures
            );
        }

        // Update error-specific counters
        for (const [error, count] of Object.entries(errors)) {
            this.prometheusMetrics.transactionsFailed.inc(
                { worker: workerId, type: 'all', stage, error },
                count
            );
        }

        // Update gauges
        if (currentTps !== undefined) {
            this.prometheusMetrics.currentTps.set(
                { worker: workerId, stage },
                currentTps
            );
        }

        // Update latency metrics
        if (latencies && latencies.length > 0) {
            latencies.forEach(latency => {
                this.prometheusMetrics.latency.observe(
                    { worker: workerId, type: 'all', stage },
                    latency
                );
                this.prometheusMetrics.latencySummary.observe(
                    { worker: workerId, type: 'all', stage },
                    latency
                );
            });
        }

        // Update per-type metrics if available
        if (metrics.perType) {
            for (const [type, typeMetrics] of Object.entries(metrics.perType)) {
                if (typeMetrics.submitted > 0) {
                    this.prometheusMetrics.transactionsTotal.inc(
                        { worker: workerId, type, stage },
                        typeMetrics.submitted
                    );
                }
                if (typeMetrics.success > 0) {
                    this.prometheusMetrics.transactionsSuccess.inc(
                        { worker: workerId, type, stage },
                        typeMetrics.success
                    );
                }
                if (typeMetrics.failures > 0) {
                    this.prometheusMetrics.transactionsFailed.inc(
                        { worker: workerId, type, stage, error: 'all' },
                        typeMetrics.failures
                    );
                }
            }
        }
    }

    /**
     * Stream metrics to StatsD
     */
    streamToStatsD(metrics) {
        if (!this.statsdEnabled || !this.statsdClient) return;

        const {
            workerId = 'unknown',
            submitted = 0,
            success = 0,
            failures = 0,
            latencies = [],
            latencyStats = {},
            currentTps = 0
        } = metrics;

        // Send counters
        if (submitted > 0) {
            this.statsdClient.increment(`transactions.submitted.${workerId}`, submitted);
        }
        if (success > 0) {
            this.statsdClient.increment(`transactions.success.${workerId}`, success);
        }
        if (failures > 0) {
            this.statsdClient.increment(`transactions.failed.${workerId}`, failures);
        }

        // Send gauges
        if (currentTps !== undefined) {
            this.statsdClient.gauge(`tps.${workerId}`, currentTps);
        }

        // Send timing metrics
        if (latencies && latencies.length > 0) {
            latencies.forEach(latency => {
                this.statsdClient.timing(`latency.${workerId}`, latency);
            });
        }

        // Send latency percentiles as gauges
        if (latencyStats.p50 !== undefined) {
            this.statsdClient.gauge(`latency.p50.${workerId}`, latencyStats.p50);
        }
        if (latencyStats.p95 !== undefined) {
            this.statsdClient.gauge(`latency.p95.${workerId}`, latencyStats.p95);
        }
        if (latencyStats.p99 !== undefined) {
            this.statsdClient.gauge(`latency.p99.${workerId}`, latencyStats.p99);
        }

        // Send success rate
        if (submitted > 0) {
            const successRate = (success / submitted) * 100;
            this.statsdClient.gauge(`success_rate.${workerId}`, successRate);
        }
    }

    /**
     * Stream metrics to custom endpoints
     */
    async streamToCustom(metrics) {
        for (const endpoint of this.config.customEndpoints) {
            try {
                const response = await fetch(endpoint.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...endpoint.headers
                    },
                    body: JSON.stringify({
                        timestamp: Date.now(),
                        ...metrics
                    })
                });

                if (!response.ok) {
                    console.error(`Failed to send metrics to ${endpoint.url}: ${response.status}`);
                }
            } catch (error) {
                console.error(`Error sending metrics to ${endpoint.url}:`, error.message);
            }
        }
    }

    /**
     * Stream metrics to all configured systems
     */
    async streamMetrics(metrics) {
        // Add timestamp if not present
        if (!metrics.timestamp) {
            metrics.timestamp = Date.now();
        }

        // Stream to all configured systems
        const promises = [];

        if (this.prometheusEnabled) {
            this.streamToPrometheus(metrics);
        }

        if (this.statsdEnabled) {
            this.streamToStatsD(metrics);
        }

        if (this.config.customEndpoints.length > 0) {
            promises.push(this.streamToCustom(metrics));
        }

        await Promise.allSettled(promises);
    }

    /**
     * Update worker count gauge
     */
    updateWorkerCount(count) {
        if (this.prometheusEnabled && this.prometheusMetrics.activeWorkers) {
            this.prometheusMetrics.activeWorkers.set(count);
        }

        if (this.statsdEnabled && this.statsdClient) {
            this.statsdClient.gauge('workers.active', count);
        }
    }

    /**
     * Record test start event
     */
    recordTestStart(testId, config) {
        const event = {
            type: 'test_start',
            testId,
            timestamp: Date.now(),
            config
        };

        if (this.statsdEnabled && this.statsdClient) {
            this.statsdClient.increment('test.started');
        }

        // Send to custom endpoints
        this.streamToCustom(event);
    }

    /**
     * Record test completion event
     */
    recordTestComplete(testId, summary) {
        const event = {
            type: 'test_complete',
            testId,
            timestamp: Date.now(),
            summary
        };

        if (this.statsdEnabled && this.statsdClient) {
            this.statsdClient.increment('test.completed');
            this.statsdClient.timing('test.duration', summary.duration);
        }

        // Send to custom endpoints
        this.streamToCustom(event);
    }

    /**
     * Close connections and cleanup
     */
    async close() {
        if (this.prometheusServer) {
            return new Promise((resolve) => {
                this.prometheusServer.close(() => {
                    console.log('Prometheus metrics server closed');
                    resolve();
                });
            });
        }

        if (this.statsdClient) {
            this.statsdClient.close();
            console.log('StatsD client closed');
        }
    }
}

// Export for use in other modules
export { MetricsStreamer };