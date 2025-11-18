import { AccountId, PrivateKey, TokenId, ContractId, TransactionReceipt } from "@hashgraph/sdk";

export interface AccountInfo {
  accountId: AccountId;
  privateKey: PrivateKey;
}

export interface TransactionResult {
  success: boolean;
  receipt?: TransactionReceipt;
  error?: Error;
  timestamp: number;
  duration: number;
  transactionId?: string;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

export interface NetworkConfig {
  name: string;
  nodes?: Record<string, string>;
  mirrorNode?: string;
  maxConnections?: number;
}

export interface TestConfig {
  duration: number;
  concurrency: number;
  rampUpTime: number;
  scenarios: string[];
  iterations?: number;
}

export interface MetricsData {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  avgDuration: number;
  p95Duration: number;
  p99Duration: number;
  throughput: number;
  timestamp: number;
}

export interface ScenarioMetrics extends MetricsData {
  scenarioName: string;
  errors: Array<{ error: string; count: number }>;
}

export interface TestResult {
  scenarioName: string;
  startTime: number;
  endTime: number;
  duration: number;
  metrics: ScenarioMetrics;
  success: boolean;
}

export interface LogLevel {
  level: 'error' | 'warn' | 'info' | 'debug';
}

export interface FrameworkConfig {
  network: NetworkConfig;
  test: TestConfig;
  retry: RetryConfig;
  logging: {
    level: string;
    file?: string;
  };
  metrics: {
    collectInterval: number;
    exportFormats: string[];
    outputDir: string;
  };
}
