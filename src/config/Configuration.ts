import Joi from "joi";
import { FrameworkConfig } from "../types/index.js";
import dotenv from "dotenv";

dotenv.config();

export class Configuration {
  private config: FrameworkConfig;

  constructor(configOverrides?: Partial<FrameworkConfig>) {
    this.config = this.loadConfig(configOverrides);
    this.validate();
  }

  private loadConfig(overrides?: Partial<FrameworkConfig>): FrameworkConfig {
    const defaultConfig: FrameworkConfig = {
      network: {
        name: process.env.HEDERA_NETWORK || "testnet",
        nodes: process.env.HEDERA_NODES
          ? JSON.parse(process.env.HEDERA_NODES)
          : undefined,
        mirrorNode: process.env.HEDERA_MIRROR_NODE,
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || "10", 10),
      },
      test: {
        duration: parseInt(process.env.TEST_DURATION || "300", 10),
        concurrency: parseInt(process.env.TEST_CONCURRENCY || "10", 10),
        rampUpTime: parseInt(process.env.TEST_RAMP_UP || "30", 10),
        scenarios: process.env.TEST_SCENARIOS
          ? process.env.TEST_SCENARIOS.split(",")
          : ["token-transfer"],
        iterations: process.env.TEST_ITERATIONS
          ? parseInt(process.env.TEST_ITERATIONS, 10)
          : undefined,
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
        retryDelay: parseInt(process.env.RETRY_DELAY || "1000", 10),
        backoffMultiplier: parseFloat(process.env.BACKOFF_MULTIPLIER || "2"),
      },
      logging: {
        level: process.env.LOG_LEVEL || "info",
        file: process.env.LOG_FILE,
      },
      metrics: {
        collectInterval: parseInt(process.env.METRICS_INTERVAL || "1000", 10),
        exportFormats: process.env.METRICS_FORMATS
          ? process.env.METRICS_FORMATS.split(",")
          : ["json", "csv"],
        outputDir: process.env.METRICS_OUTPUT_DIR || "./results",
      },
    };

    return this.mergeConfig(defaultConfig, overrides);
  }

  private mergeConfig(
    base: FrameworkConfig,
    overrides?: Partial<FrameworkConfig>
  ): FrameworkConfig {
    if (!overrides) {
      return base;
    }

    return {
      network: { ...base.network, ...overrides.network },
      test: { ...base.test, ...overrides.test },
      retry: { ...base.retry, ...overrides.retry },
      logging: { ...base.logging, ...overrides.logging },
      metrics: { ...base.metrics, ...overrides.metrics },
    };
  }

  private validate(): void {
    const schema = Joi.object({
      network: Joi.object({
        name: Joi.string().required(),
        nodes: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
        mirrorNode: Joi.string().uri().optional(),
        maxConnections: Joi.number().integer().min(1).max(100).optional(),
      }).required(),
      test: Joi.object({
        duration: Joi.number().integer().min(1).required(),
        concurrency: Joi.number().integer().min(1).max(1000).required(),
        rampUpTime: Joi.number().integer().min(0).required(),
        scenarios: Joi.array().items(Joi.string()).min(1).required(),
        iterations: Joi.number().integer().min(1).optional(),
      }).required(),
      retry: Joi.object({
        maxRetries: Joi.number().integer().min(0).max(10).required(),
        retryDelay: Joi.number().integer().min(0).required(),
        backoffMultiplier: Joi.number().min(1).max(10).required(),
      }).required(),
      logging: Joi.object({
        level: Joi.string()
          .valid("error", "warn", "info", "debug")
          .required(),
        file: Joi.string().optional(),
      }).required(),
      metrics: Joi.object({
        collectInterval: Joi.number().integer().min(100).required(),
        exportFormats: Joi.array()
          .items(Joi.string().valid("json", "csv", "html"))
          .required(),
        outputDir: Joi.string().required(),
      }).required(),
    });

    const { error } = schema.validate(this.config);

    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  public getConfig(): FrameworkConfig {
    return this.config;
  }

  public getNetworkConfig() {
    return this.config.network;
  }

  public getTestConfig() {
    return this.config.test;
  }

  public getRetryConfig() {
    return this.config.retry;
  }

  public getLoggingConfig() {
    return this.config.logging;
  }

  public getMetricsConfig() {
    return this.config.metrics;
  }

  public updateConfig(updates: Partial<FrameworkConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.validate();
  }
}
