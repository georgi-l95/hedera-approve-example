import { TestResult, ScenarioMetrics } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";

export class ResultAggregator {
  private readonly logger: Logger;
  private readonly errorHandler: ErrorHandler;
  private results: TestResult[] = [];

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  public addResult(result: TestResult): void {
    this.results.push(result);
    this.logger.debug(`Added result for scenario: ${result.scenarioName}`);
  }

  public addResults(results: TestResult[]): void {
    this.results.push(...results);
    this.logger.debug(`Added ${results.length} results`);
  }

  public getResults(): TestResult[] {
    return [...this.results];
  }

  public getResultsByScenario(scenarioName: string): TestResult[] {
    return this.results.filter((r) => r.scenarioName === scenarioName);
  }

  public getAggregatedMetrics(): {
    totalScenarios: number;
    totalDuration: number;
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    overallSuccessRate: number;
    overallThroughput: number;
    scenarioMetrics: ScenarioMetrics[];
  } {
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const totalTransactions = this.results.reduce(
      (sum, r) => sum + r.metrics.totalTransactions,
      0
    );
    const successfulTransactions = this.results.reduce(
      (sum, r) => sum + r.metrics.successfulTransactions,
      0
    );
    const failedTransactions = this.results.reduce(
      (sum, r) => sum + r.metrics.failedTransactions,
      0
    );

    const overallSuccessRate =
      totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

    const overallThroughput =
      totalDuration > 0 ? (successfulTransactions / totalDuration) * 1000 : 0;

    return {
      totalScenarios: this.results.length,
      totalDuration,
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      overallSuccessRate,
      overallThroughput,
      scenarioMetrics: this.results.map((r) => r.metrics),
    };
  }

  public getSummary(): string {
    const metrics = this.getAggregatedMetrics();

    return `
Test Summary:
=============
Total Scenarios: ${metrics.totalScenarios}
Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s
Total Transactions: ${metrics.totalTransactions}
Successful: ${metrics.successfulTransactions}
Failed: ${metrics.failedTransactions}
Success Rate: ${metrics.overallSuccessRate.toFixed(2)}%
Throughput: ${metrics.overallThroughput.toFixed(2)} TPS

Scenario Breakdown:
${this.results
  .map(
    (r) => `
  ${r.scenarioName}:
    Duration: ${(r.duration / 1000).toFixed(2)}s
    Transactions: ${r.metrics.totalTransactions}
    Success Rate: ${((r.metrics.successfulTransactions / r.metrics.totalTransactions) * 100).toFixed(2)}%
    Throughput: ${r.metrics.throughput.toFixed(2)} TPS
    Avg Response Time: ${r.metrics.avgDuration.toFixed(2)}ms
    P95 Response Time: ${r.metrics.p95Duration.toFixed(2)}ms
    P99 Response Time: ${r.metrics.p99Duration.toFixed(2)}ms`
  )
  .join("\n")}
    `;
  }

  public clear(): void {
    this.results = [];
    this.logger.debug("Result aggregator cleared");
  }
}
