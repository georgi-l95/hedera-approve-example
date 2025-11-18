import { TransactionResult, MetricsData } from "../types/index.js";
import { Logger } from "../utils/Logger.js";

export class MetricsCollector {
  private readonly logger: Logger;
  private transactions: TransactionResult[] = [];
  private startTime: number = 0;
  private endTime: number = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public start(): void {
    this.startTime = Date.now();
    this.logger.debug("Metrics collection started");
  }

  public stop(): void {
    this.endTime = Date.now();
    this.logger.debug("Metrics collection stopped");
  }

  public recordTransaction(result: TransactionResult): void {
    this.transactions.push(result);
  }

  public recordTransactions(results: TransactionResult[]): void {
    this.transactions.push(...results);
  }

  public getMetrics(): MetricsData {
    const successfulTxs = this.transactions.filter((tx) => tx.success);
    const failedTxs = this.transactions.filter((tx) => !tx.success);

    const durations = successfulTxs.map((tx) => tx.duration).sort((a, b) => a - b);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const minDuration = durations.length > 0 ? durations[0] : 0;
    const maxDuration = durations.length > 0 ? durations[durations.length - 1] : 0;
    const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0;

    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);
    const p95Duration = durations.length > 0 ? durations[p95Index] || maxDuration : 0;
    const p99Duration = durations.length > 0 ? durations[p99Index] || maxDuration : 0;

    const elapsedTime = (this.endTime || Date.now()) - this.startTime;
    const throughput = elapsedTime > 0 ? (successfulTxs.length / elapsedTime) * 1000 : 0;

    return {
      totalTransactions: this.transactions.length,
      successfulTransactions: successfulTxs.length,
      failedTransactions: failedTxs.length,
      totalDuration,
      minDuration,
      maxDuration,
      avgDuration,
      p95Duration,
      p99Duration,
      throughput,
      timestamp: Date.now(),
    };
  }

  public getTransactionResults(): TransactionResult[] {
    return [...this.transactions];
  }

  public getSuccessRate(): number {
    if (this.transactions.length === 0) {
      return 0;
    }
    const successful = this.transactions.filter((tx) => tx.success).length;
    return (successful / this.transactions.length) * 100;
  }

  public reset(): void {
    this.transactions = [];
    this.startTime = 0;
    this.endTime = 0;
    this.logger.debug("Metrics collector reset");
  }

  public getTransactionCount(): number {
    return this.transactions.length;
  }

  public getElapsedTime(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}
