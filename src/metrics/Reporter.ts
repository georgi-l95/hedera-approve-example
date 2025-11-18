import { TestResult, ScenarioMetrics } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import fs from "fs/promises";
import path from "path";

export class Reporter {
  private readonly logger: Logger;
  private readonly outputDir: string;

  constructor(logger: Logger, outputDir: string = "./results") {
    this.logger = logger;
    this.outputDir = outputDir;
  }

  public async exportJSON(
    results: TestResult[],
    filename?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const file = filename || `test-results-${timestamp}.json`;
    const filePath = path.join(this.outputDir, file);

    await this.ensureOutputDir();

    const data = {
      timestamp: new Date().toISOString(),
      results,
      summary: this.generateSummary(results),
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    this.logger.info(`JSON report exported to: ${filePath}`);

    return filePath;
  }

  public async exportCSV(
    results: TestResult[],
    filename?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const file = filename || `test-results-${timestamp}.csv`;
    const filePath = path.join(this.outputDir, file);

    await this.ensureOutputDir();

    const headers = [
      "Scenario",
      "Start Time",
      "End Time",
      "Duration (s)",
      "Total Transactions",
      "Successful",
      "Failed",
      "Success Rate (%)",
      "Throughput (TPS)",
      "Avg Duration (ms)",
      "Min Duration (ms)",
      "Max Duration (ms)",
      "P95 Duration (ms)",
      "P99 Duration (ms)",
    ].join(",");

    const rows = results.map((r) => {
      const successRate =
        r.metrics.totalTransactions > 0
          ? (r.metrics.successfulTransactions / r.metrics.totalTransactions) * 100
          : 0;

      return [
        r.scenarioName,
        new Date(r.startTime).toISOString(),
        new Date(r.endTime).toISOString(),
        (r.duration / 1000).toFixed(2),
        r.metrics.totalTransactions,
        r.metrics.successfulTransactions,
        r.metrics.failedTransactions,
        successRate.toFixed(2),
        r.metrics.throughput.toFixed(2),
        r.metrics.avgDuration.toFixed(2),
        r.metrics.minDuration.toFixed(2),
        r.metrics.maxDuration.toFixed(2),
        r.metrics.p95Duration.toFixed(2),
        r.metrics.p99Duration.toFixed(2),
      ].join(",");
    });

    const csv = [headers, ...rows].join("\n");
    await fs.writeFile(filePath, csv);
    this.logger.info(`CSV report exported to: ${filePath}`);

    return filePath;
  }

  public async exportHTML(
    results: TestResult[],
    filename?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const file = filename || `test-results-${timestamp}.html`;
    const filePath = path.join(this.outputDir, file);

    await this.ensureOutputDir();

    const summary = this.generateSummary(results);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Hedera Performance Test Results</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
    }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 5px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric {
      display: inline-block;
      margin: 10px 20px 10px 0;
    }
    .metric-label {
      font-weight: bold;
      color: #666;
    }
    .metric-value {
      font-size: 1.2em;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #4CAF50;
      color: white;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .success { color: #4CAF50; }
    .failure { color: #f44336; }
  </style>
</head>
<body>
  <h1>Hedera Performance Test Results</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="summary">
    <h2>Overall Summary</h2>
    <div class="metric">
      <div class="metric-label">Total Scenarios</div>
      <div class="metric-value">${summary.totalScenarios}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Transactions</div>
      <div class="metric-value">${summary.totalTransactions}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Success Rate</div>
      <div class="metric-value success">${summary.successRate.toFixed(2)}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Throughput</div>
      <div class="metric-value">${summary.throughput.toFixed(2)} TPS</div>
    </div>
  </div>

  <h2>Scenario Results</h2>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>Duration</th>
        <th>Transactions</th>
        <th>Success Rate</th>
        <th>Throughput</th>
        <th>Avg Time</th>
        <th>P95 Time</th>
        <th>P99 Time</th>
      </tr>
    </thead>
    <tbody>
      ${results
        .map((r) => {
          const successRate =
            r.metrics.totalTransactions > 0
              ? (r.metrics.successfulTransactions / r.metrics.totalTransactions) * 100
              : 0;
          return `
        <tr>
          <td>${r.scenarioName}</td>
          <td>${(r.duration / 1000).toFixed(2)}s</td>
          <td>${r.metrics.totalTransactions}</td>
          <td class="${successRate >= 95 ? 'success' : 'failure'}">${successRate.toFixed(2)}%</td>
          <td>${r.metrics.throughput.toFixed(2)} TPS</td>
          <td>${r.metrics.avgDuration.toFixed(2)}ms</td>
          <td>${r.metrics.p95Duration.toFixed(2)}ms</td>
          <td>${r.metrics.p99Duration.toFixed(2)}ms</td>
        </tr>
      `;
        })
        .join("")}
    </tbody>
  </table>
</body>
</html>
    `;

    await fs.writeFile(filePath, html);
    this.logger.info(`HTML report exported to: ${filePath}`);

    return filePath;
  }

  public async exportAll(results: TestResult[]): Promise<string[]> {
    const paths = await Promise.all([
      this.exportJSON(results),
      this.exportCSV(results),
      this.exportHTML(results),
    ]);

    this.logger.info("All reports exported successfully");
    return paths;
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.access(this.outputDir);
    } catch {
      await fs.mkdir(this.outputDir, { recursive: true });
      this.logger.debug(`Created output directory: ${this.outputDir}`);
    }
  }

  private generateSummary(results: TestResult[]) {
    const totalTransactions = results.reduce(
      (sum, r) => sum + r.metrics.totalTransactions,
      0
    );
    const successfulTransactions = results.reduce(
      (sum, r) => sum + r.metrics.successfulTransactions,
      0
    );
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      totalScenarios: results.length,
      totalTransactions,
      successfulTransactions,
      failedTransactions: totalTransactions - successfulTransactions,
      successRate:
        totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0,
      throughput: totalDuration > 0 ? (successfulTransactions / totalDuration) * 1000 : 0,
    };
  }
}
