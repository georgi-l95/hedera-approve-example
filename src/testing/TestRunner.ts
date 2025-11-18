import { Wallet } from "@hashgraph/sdk";
import { TestScenario, TestScenarioContext } from "./TestScenario.js";
import { LoadGenerator } from "./LoadGenerator.js";
import { ResultAggregator } from "../metrics/ResultAggregator.js";
import { Reporter } from "../metrics/Reporter.js";
import { Logger } from "../utils/Logger.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import { TestConfig, TestResult } from "../types/index.js";

export class TestRunner {
  private readonly logger: Logger;
  private readonly errorHandler: ErrorHandler;
  private readonly loadGenerator: LoadGenerator;
  private readonly resultAggregator: ResultAggregator;
  private readonly reporter: Reporter;
  private readonly scenarios: Map<string, TestScenario> = new Map();

  constructor(
    logger: Logger,
    errorHandler: ErrorHandler,
    outputDir: string = "./results"
  ) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.loadGenerator = new LoadGenerator(logger);
    this.resultAggregator = new ResultAggregator(logger, errorHandler);
    this.reporter = new Reporter(logger, outputDir);
  }

  public registerScenario(scenario: TestScenario): void {
    this.scenarios.set(scenario.getName(), scenario);
    this.logger.info(
      `Registered scenario: ${scenario.getName()} - ${scenario.getDescription()}`
    );
  }

  public getScenario(name: string): TestScenario | undefined {
    return this.scenarios.get(name);
  }

  public listScenarios(): string[] {
    return Array.from(this.scenarios.keys());
  }

  public async runScenario(
    scenarioName: string,
    wallet: Wallet
  ): Promise<TestResult> {
    const scenario = this.scenarios.get(scenarioName);

    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioName}`);
    }

    this.logger.info(`Running scenario: ${scenarioName}`);

    const context: TestScenarioContext = {
      wallet,
      logger: this.logger,
      errorHandler: this.errorHandler,
    };

    const result = await scenario.run(context);
    this.resultAggregator.addResult(result);

    return result;
  }

  public async runScenarios(
    scenarioNames: string[],
    wallet: Wallet
  ): Promise<TestResult[]> {
    this.logger.info(`Running ${scenarioNames.length} scenarios`);

    const results: TestResult[] = [];

    for (const scenarioName of scenarioNames) {
      const result = await this.runScenario(scenarioName, wallet);
      results.push(result);
    }

    return results;
  }

  public async runWithLoadPattern(
    scenarioName: string,
    wallet: Wallet,
    testConfig: TestConfig
  ): Promise<TestResult[]> {
    const scenario = this.scenarios.get(scenarioName);

    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioName}`);
    }

    this.logger.info(
      `Running scenario ${scenarioName} with load pattern: ${testConfig.concurrency} workers for ${testConfig.duration}s`
    );

    const context: TestScenarioContext = {
      wallet,
      logger: this.logger,
      errorHandler: this.errorHandler,
    };

    const workerFunction = async () => {
      return await scenario.run(context);
    };

    let results: TestResult[];

    if (testConfig.iterations) {
      results = await this.loadGenerator.generateIterations(
        testConfig.concurrency,
        testConfig.iterations,
        workerFunction
      );
    } else {
      results = await this.loadGenerator.generateLoad(
        {
          concurrency: testConfig.concurrency,
          duration: testConfig.duration,
          rampUpTime: testConfig.rampUpTime,
        },
        workerFunction
      );
    }

    this.resultAggregator.addResults(results);

    return results;
  }

  public async generateReports(
    formats: string[] = ["json", "csv", "html"]
  ): Promise<string[]> {
    const results = this.resultAggregator.getResults();

    if (results.length === 0) {
      this.logger.warn("No results to export");
      return [];
    }

    this.logger.info(`Generating reports in formats: ${formats.join(", ")}`);

    const exportPaths: string[] = [];

    for (const format of formats) {
      switch (format.toLowerCase()) {
        case "json":
          exportPaths.push(await this.reporter.exportJSON(results));
          break;
        case "csv":
          exportPaths.push(await this.reporter.exportCSV(results));
          break;
        case "html":
          exportPaths.push(await this.reporter.exportHTML(results));
          break;
        default:
          this.logger.warn(`Unknown export format: ${format}`);
      }
    }

    return exportPaths;
  }

  public getSummary(): string {
    return this.resultAggregator.getSummary();
  }

  public getResults(): TestResult[] {
    return this.resultAggregator.getResults();
  }

  public clearResults(): void {
    this.resultAggregator.clear();
    this.errorHandler.clearErrorStats();
  }
}
