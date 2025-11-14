/**
 * Shared utilities for load testing framework
 * These utilities can be used by both the basic and enhanced load test implementations
 */

import fs from "fs";
import { performance } from "node:perf_hooks";

/**
 * Adaptive rate controller that adjusts TPS based on success rate
 */
export class AdaptiveRateController {
    constructor(initialTps = 10, targetSuccessRate = 0.95, adjustmentFactor = 0.1) {
        this.currentTps = initialTps;
        this.targetSuccessRate = targetSuccessRate;
        this.adjustmentFactor = adjustmentFactor;
        this.history = [];
        this.maxHistorySize = 10;
    }

    /**
     * Adjust TPS based on current metrics
     * @param {Object} metrics - Current stage metrics
     * @returns {number} Adjusted TPS value
     */
    adjust(metrics) {
        if (metrics.submitted === 0) return this.currentTps;

        const successRate = metrics.success / metrics.submitted;
        this.history.push({ tps: this.currentTps, successRate, timestamp: Date.now() });

        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }

        // Determine adjustment based on success rate
        let adjustment = 0;
        if (successRate < this.targetSuccessRate - 0.05) {
            // Significant failure rate, reduce TPS
            adjustment = -this.adjustmentFactor * 2;
        } else if (successRate < this.targetSuccessRate) {
            // Minor failure rate, slight reduction
            adjustment = -this.adjustmentFactor;
        } else if (successRate >= 0.99) {
            // Very high success rate, can increase TPS
            adjustment = this.adjustmentFactor;
        }

        // Apply adjustment with bounds
        this.currentTps = Math.max(1, this.currentTps * (1 + adjustment));
        this.currentTps = Math.min(1000, this.currentTps); // Cap at 1000 TPS

        return Math.floor(this.currentTps);
    }

    /**
     * Get recommendation based on history
     * @returns {string} Recommendation message
     */
    getRecommendation() {
        if (this.history.length < 3) {
            return "Insufficient data for recommendations";
        }

        const recentSuccessRates = this.history.slice(-3).map(h => h.successRate);
        const avgSuccessRate = recentSuccessRates.reduce((a, b) => a + b, 0) / recentSuccessRates.length;

        if (avgSuccessRate < 0.9) {
            return `Network appears overloaded. Consider reducing TPS below ${this.currentTps}`;
        } else if (avgSuccessRate >= 0.99) {
            return `Network handling load well. Can potentially increase TPS above ${this.currentTps}`;
        } else {
            return `Current TPS of ${this.currentTps} appears optimal for network conditions`;
        }
    }
}

/**
 * Connection pool manager for managing multiple client instances
 */
export class ConnectionPool {
    constructor(clientFactory, size = 5) {
        this.clients = [];
        this.currentIndex = 0;
        this.size = size;

        for (let i = 0; i < size; i++) {
            this.clients.push(clientFactory());
        }
    }

    /**
     * Get next client using round-robin selection
     * @returns {Object} Next client instance
     */
    getClient() {
        const client = this.clients[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.size;
        return client;
    }

    /**
     * Get all clients
     * @returns {Array} All client instances
     */
    getAllClients() {
        return this.clients;
    }

    /**
     * Execute operation on least loaded client
     * @param {Function} operation - Operation to execute
     * @returns {Promise} Operation result
     */
    async executeBalanced(operation) {
        // In a real implementation, track active operations per client
        // For now, use round-robin
        const client = this.getClient();
        return operation(client);
    }
}

/**
 * Metrics aggregator for combining results from multiple sources
 */
export class MetricsAggregator {
    constructor() {
        this.sources = new Map();
    }

    /**
     * Add metrics from a source
     * @param {string} sourceId - Unique identifier for the source
     * @param {Object} metrics - Metrics data
     */
    addMetrics(sourceId, metrics) {
        this.sources.set(sourceId, metrics);
    }

    /**
     * Aggregate all metrics
     * @returns {Object} Aggregated metrics
     */
    aggregate() {
        const aggregated = {
            submitted: 0,
            success: 0,
            failures: 0,
            latencies: [],
            errors: {},
            statusCounts: {},
            startedAt: Number.POSITIVE_INFINITY,
            completedAt: 0
        };

        for (const metrics of this.sources.values()) {
            aggregated.submitted += metrics.submitted || 0;
            aggregated.success += metrics.success || 0;
            aggregated.failures += metrics.failures || 0;

            // Collect all latencies for percentile calculation
            if (metrics.latencies) {
                aggregated.latencies.push(...metrics.latencies);
            }

            // Merge error counts
            for (const [error, count] of Object.entries(metrics.errors || {})) {
                aggregated.errors[error] = (aggregated.errors[error] || 0) + count;
            }

            // Merge status counts
            for (const [status, count] of Object.entries(metrics.statusCounts || {})) {
                aggregated.statusCounts[status] = (aggregated.statusCounts[status] || 0) + count;
            }

            // Track overall time bounds
            if (metrics.startedAt) {
                aggregated.startedAt = Math.min(aggregated.startedAt, metrics.startedAt);
            }
            if (metrics.completedAt) {
                aggregated.completedAt = Math.max(aggregated.completedAt, metrics.completedAt);
            }
        }

        // Calculate percentiles from all latencies
        if (aggregated.latencies.length > 0) {
            aggregated.latencyPercentiles = calculatePercentiles(aggregated.latencies);
        }

        return aggregated;
    }
}

/**
 * Calculate percentiles from an array of values
 * @param {Array<number>} values - Array of numeric values
 * @returns {Object} Percentile statistics
 */
export function calculatePercentiles(values) {
    if (!values || values.length === 0) {
        return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;

    return {
        p50: sorted[Math.floor(len * 0.5)],
        p95: sorted[Math.floor(len * 0.95)],
        p99: sorted[Math.floor(len * 0.99)],
        min: sorted[0],
        max: sorted[len - 1],
        avg: values.reduce((a, b) => a + b, 0) / len,
        count: len
    };
}

/**
 * Format duration in human-readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }
}

/**
 * Format large numbers with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Generate a summary report from metrics
 * @param {Object} metrics - Test metrics
 * @returns {string} Formatted report
 */
export function generateReport(metrics) {
    const lines = [
        "=" .repeat(60),
        "LOAD TEST SUMMARY REPORT",
        "=" .repeat(60),
        "",
        `Total Transactions: ${formatNumber(metrics.submitted)}`,
        `Successful: ${formatNumber(metrics.success)} (${(metrics.success / metrics.submitted * 100).toFixed(2)}%)`,
        `Failed: ${formatNumber(metrics.failures)} (${(metrics.failures / metrics.submitted * 100).toFixed(2)}%)`,
        "",
        "LATENCY STATISTICS (ms):",
        "-" .repeat(30),
    ];

    if (metrics.latencyPercentiles) {
        const lp = metrics.latencyPercentiles;
        lines.push(
            `  Average: ${lp.avg.toFixed(2)}`,
            `  Median (P50): ${lp.p50.toFixed(2)}`,
            `  P95: ${lp.p95.toFixed(2)}`,
            `  P99: ${lp.p99.toFixed(2)}`,
            `  Min: ${lp.min.toFixed(2)}`,
            `  Max: ${lp.max.toFixed(2)}`
        );
    }

    if (Object.keys(metrics.errors || {}).length > 0) {
        lines.push("", "TOP ERRORS:", "-" .repeat(30));
        const sortedErrors = Object.entries(metrics.errors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        for (const [error, count] of sortedErrors) {
            lines.push(`  ${error}: ${count}`);
        }
    }

    if (metrics.startedAt && metrics.completedAt) {
        const durationMs = metrics.completedAt - metrics.startedAt;
        const durationSec = durationMs / 1000;
        const throughput = metrics.submitted / durationSec;

        lines.push(
            "",
            "PERFORMANCE:",
            "-" .repeat(30),
            `  Test Duration: ${formatDuration(Math.floor(durationSec))}`,
            `  Average Throughput: ${throughput.toFixed(2)} TPS`
        );
    }

    lines.push("", "=" .repeat(60));
    return lines.join("\n");
}

/**
 * Estimate cost of load test in HBAR
 * @param {Object} config - Test configuration
 * @returns {number} Estimated cost in HBAR
 */
export function estimateTestCost(config) {
    let totalTransactions = 0;

    for (const stage of config.stages) {
        totalTransactions += stage.tps * stage.durationSeconds;
    }

    // Base transaction cost estimate
    const baseCostPerTx = 0.001; // Conservative estimate
    let totalCost = totalTransactions * baseCostPerTx;

    // Add account creation costs
    totalCost += config.accountPoolSize * 1; // ~1 HBAR per account creation

    // Add initial balance
    totalCost += config.accountPoolSize * config.accountInitialBalanceHbar;

    // Add token/NFT creation costs if enabled
    if (config.enableTokenOperations) {
        totalCost += 30; // Token creation cost
    }
    if (config.enableNFTOperations) {
        totalCost += 50; // NFT collection creation and minting
    }

    return totalCost;
}

/**
 * Validate network readiness before test
 * @param {Object} client - Hedera client
 * @returns {Promise<Object>} Validation result
 */
export async function validateNetworkReadiness(client) {
    const result = {
        ready: true,
        warnings: [],
        errors: []
    };

    try {
        // Test basic connectivity
        const startTime = performance.now();
        await client.ping();
        const pingTime = performance.now() - startTime;

        if (pingTime > 1000) {
            result.warnings.push(`High network latency detected: ${pingTime.toFixed(0)}ms`);
        }

        // Check network status (this would need actual implementation)
        // const status = await client.getNetworkStatus();
        // if (status.congestionLevel > 0.8) {
        //     result.warnings.push("Network appears congested");
        // }

    } catch (error) {
        result.ready = false;
        result.errors.push(`Network connectivity issue: ${error.message}`);
    }

    return result;
}

/**
 * Create a performance baseline for comparison
 * @param {Object} metrics - Test metrics
 * @returns {Object} Baseline data
 */
export function createBaseline(metrics) {
    return {
        timestamp: new Date().toISOString(),
        successRate: metrics.success / metrics.submitted,
        avgLatency: metrics.latencyPercentiles?.avg || 0,
        p95Latency: metrics.latencyPercentiles?.p95 || 0,
        p99Latency: metrics.latencyPercentiles?.p99 || 0,
        throughput: metrics.submitted / ((metrics.completedAt - metrics.startedAt) / 1000),
        errorRate: metrics.failures / metrics.submitted
    };
}

/**
 * Compare current metrics against baseline
 * @param {Object} current - Current metrics
 * @param {Object} baseline - Baseline metrics
 * @returns {Object} Comparison results
 */
export function compareToBaseline(current, baseline) {
    const currentBaseline = createBaseline(current);

    return {
        successRateDelta: ((currentBaseline.successRate - baseline.successRate) * 100).toFixed(2) + "%",
        avgLatencyDelta: ((currentBaseline.avgLatency - baseline.avgLatency) / baseline.avgLatency * 100).toFixed(2) + "%",
        p95LatencyDelta: ((currentBaseline.p95Latency - baseline.p95Latency) / baseline.p95Latency * 100).toFixed(2) + "%",
        throughputDelta: ((currentBaseline.throughput - baseline.throughput) / baseline.throughput * 100).toFixed(2) + "%",
        regression: currentBaseline.p95Latency > baseline.p95Latency * 1.2 ||
                   currentBaseline.successRate < baseline.successRate * 0.95
    };
}

/**
 * Save baseline to file
 * @param {Object} baseline - Baseline data
 * @param {string} filename - Output filename
 */
export async function saveBaseline(baseline, filename = "loadtest-baseline.json") {
    await fs.promises.writeFile(filename, JSON.stringify(baseline, null, 2));
}

/**
 * Load baseline from file
 * @param {string} filename - Baseline filename
 * @returns {Promise<Object>} Baseline data
 */
export async function loadBaseline(filename = "loadtest-baseline.json") {
    const data = await fs.promises.readFile(filename, "utf8");
    return JSON.parse(data);
}