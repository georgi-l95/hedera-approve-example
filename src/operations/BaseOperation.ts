import { Wallet } from "@hashgraph/sdk";
import { Logger } from "../utils/Logger.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";
import { TransactionExecutor } from "../core/TransactionExecutor.js";
import { TransactionResult } from "../types/index.js";

export abstract class BaseOperation {
  protected readonly logger: Logger;
  protected readonly errorHandler: ErrorHandler;
  protected readonly executor: TransactionExecutor;

  constructor(
    logger: Logger,
    errorHandler: ErrorHandler,
    executor: TransactionExecutor
  ) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.executor = executor;
  }

  protected async waitForReceipt(result: TransactionResult): Promise<void> {
    if (!result.success) {
      throw result.error || new Error("Transaction failed");
    }
  }

  protected logSuccess(operation: string, details?: Record<string, unknown>): void {
    this.logger.info(`${operation} completed successfully`, details);
  }

  protected logFailure(operation: string, error: Error): void {
    this.logger.error(`${operation} failed`, error);
  }

  public abstract getName(): string;
}
