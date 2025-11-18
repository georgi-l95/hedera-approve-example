import { Wallet } from "@hashgraph/sdk";
import { TestResult, ScenarioMetrics } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { MetricsCollector } from "../metrics/MetricsCollector.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";

export interface TestScenarioContext {
  wallet: Wallet;
  logger: Logger;
  errorHandler: ErrorHandler;
}

export abstract class TestScenario {
  protected readonly logger: Logger;
  protected readonly errorHandler: ErrorHandler;
  protected readonly metricsCollector: MetricsCollector;
  protected context?: TestScenarioContext;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.metricsCollector = new MetricsCollector(logger);
  }

  public async run(context: TestScenarioContext): Promise<TestResult> {
    this.context = context;
    const startTime = Date.now();

    this.logger.info(`Starting scenario: ${this.getName()}`);
    this.metricsCollector.start();

    try {
      await this.setup();
      await this.execute();
    } catch (error) {
      this.logger.error(`Scenario ${this.getName()} failed`, error as Error);
    } finally {
      await this.teardown();
      this.metricsCollector.stop();
    }

    const endTime = Date.now();
    const metrics = this.metricsCollector.getMetrics();

    const errors = this.errorHandler.getMostCommonErrors(10);

    const scenarioMetrics: ScenarioMetrics = {
      ...metrics,
      scenarioName: this.getName(),
      errors,
    };

    const result: TestResult = {
      scenarioName: this.getName(),
      startTime,
      endTime,
      duration: endTime - startTime,
      metrics: scenarioMetrics,
      success: scenarioMetrics.failedTransactions === 0,
    };

    this.logger.info(`Scenario ${this.getName()} completed in ${result.duration}ms`);
    return result;
  }

  protected getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  public abstract getName(): string;
  public abstract getDescription(): string;

  protected abstract setup(): Promise<void>;
  protected abstract execute(): Promise<void>;
  protected abstract teardown(): Promise<void>;
}
