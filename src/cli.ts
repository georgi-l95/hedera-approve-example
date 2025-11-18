#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { Configuration } from "./config/Configuration.js";
import { HederaClient } from "./core/HederaClient.js";
import { WalletManager } from "./core/WalletManager.js";
import { Logger } from "./utils/Logger.js";
import { ErrorHandler } from "./utils/ErrorHandler.js";
import { TestRunner } from "./testing/TestRunner.js";
import { TokenTransferScenario } from "./testing/scenarios/TokenTransferScenario.js";
import { ApprovalScenario } from "./testing/scenarios/ApprovalScenario.js";
import { ContractCallScenario } from "./testing/scenarios/ContractCallScenario.js";

const program = new Command();

program
  .name("hedera-perf")
  .description("Hedera Performance Testing Framework")
  .version("2.0.0");

program
  .command("test")
  .description("Run performance tests")
  .option("-s, --scenario <name>", "Scenario name to run")
  .option("-c, --concurrency <number>", "Number of concurrent workers", "10")
  .option("-d, --duration <seconds>", "Test duration in seconds", "60")
  .option("-r, --ramp-up <seconds>", "Ramp-up time in seconds", "10")
  .option("-i, --iterations <number>", "Number of iterations instead of duration")
  .option("-o, --output <directory>", "Output directory for results", "./results")
  .option("-f, --formats <formats>", "Export formats (json,csv,html)", "json,csv,html")
  .option("--log-level <level>", "Log level (error,warn,info,debug)", "info")
  .action(async (options) => {
    const spinner = ora("Initializing framework...").start();

    try {
      const config = new Configuration({
        test: {
          duration: parseInt(options.duration, 10),
          concurrency: parseInt(options.concurrency, 10),
          rampUpTime: parseInt(options.rampUp, 10),
          scenarios: options.scenario ? [options.scenario] : ["token-transfer"],
          iterations: options.iterations ? parseInt(options.iterations, 10) : undefined,
        },
        metrics: {
          collectInterval: 1000,
          exportFormats: options.formats.split(","),
          outputDir: options.output,
        },
        logging: {
          level: options.logLevel,
        },
      });

      const logger = new Logger(config.getLoggingConfig().level);
      const errorHandler = new ErrorHandler(logger);

      if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
        spinner.fail("Missing required environment variables");
        console.error(
          chalk.red("\nError: OPERATOR_ID and OPERATOR_KEY must be set in .env file\n")
        );
        process.exit(1);
      }

      const hederaClient = new HederaClient(
        process.env.OPERATOR_ID,
        process.env.OPERATOR_KEY,
        config.getNetworkConfig(),
        logger
      );

      const client = hederaClient.initialize();
      const walletManager = new WalletManager(logger);
      const wallet = walletManager.createWallet(
        process.env.OPERATOR_ID,
        process.env.OPERATOR_KEY,
        client
      );

      const testRunner = new TestRunner(logger, errorHandler, config.getMetricsConfig().outputDir);

      testRunner.registerScenario(new TokenTransferScenario(logger, errorHandler));
      testRunner.registerScenario(new ApprovalScenario(logger, errorHandler));
      testRunner.registerScenario(new ContractCallScenario(logger, errorHandler));

      spinner.succeed("Framework initialized");

      console.log(chalk.blue("\n🚀 Starting performance test...\n"));
      console.log(chalk.gray(`Scenario: ${options.scenario || "token-transfer"}`));
      console.log(chalk.gray(`Concurrency: ${options.concurrency}`));
      if (options.iterations) {
        console.log(chalk.gray(`Iterations: ${options.iterations}`));
      } else {
        console.log(chalk.gray(`Duration: ${options.duration}s`));
        console.log(chalk.gray(`Ramp-up: ${options.rampUp}s`));
      }
      console.log();

      const testSpinner = ora("Running test scenario...").start();

      const scenarioName = options.scenario || "token-transfer";
      await testRunner.runWithLoadPattern(scenarioName, wallet, config.getTestConfig());

      testSpinner.succeed("Test completed");

      console.log(chalk.green("\n✅ Test Summary:\n"));
      console.log(testRunner.getSummary());

      const reportSpinner = ora("Generating reports...").start();
      const reportPaths = await testRunner.generateReports(config.getMetricsConfig().exportFormats);
      reportSpinner.succeed("Reports generated");

      console.log(chalk.blue("\n📊 Reports exported to:"));
      reportPaths.forEach((path) => console.log(chalk.gray(`  - ${path}`)));

      await hederaClient.close();

      console.log(chalk.green("\n✨ Done!\n"));
      process.exit(0);
    } catch (error) {
      spinner.fail("Test failed");
      console.error(chalk.red("\n❌ Error:"), (error as Error).message);
      console.error((error as Error).stack);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List available test scenarios")
  .action(() => {
    console.log(chalk.blue("\n📋 Available Test Scenarios:\n"));

    const logger = new Logger("error");
    const errorHandler = new ErrorHandler(logger);
    const testRunner = new TestRunner(logger, errorHandler);

    testRunner.registerScenario(new TokenTransferScenario(logger, errorHandler));
    testRunner.registerScenario(new ApprovalScenario(logger, errorHandler));
    testRunner.registerScenario(new ContractCallScenario(logger, errorHandler));

    const scenarios = [
      new TokenTransferScenario(logger, errorHandler),
      new ApprovalScenario(logger, errorHandler),
      new ContractCallScenario(logger, errorHandler),
    ];

    scenarios.forEach((scenario) => {
      console.log(chalk.green(`  ${scenario.getName()}`));
      console.log(chalk.gray(`    ${scenario.getDescription()}\n`));
    });
  });

program.parse();
