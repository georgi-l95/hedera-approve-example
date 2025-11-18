import { Transaction, Wallet } from "@hashgraph/sdk";
import { TransactionResult, RetryConfig } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";

export class TransactionExecutor {
  private readonly logger: Logger;
  private readonly errorHandler: ErrorHandler;
  private readonly retryConfig: RetryConfig;

  constructor(
    logger: Logger,
    errorHandler: ErrorHandler,
    retryConfig: RetryConfig
  ) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.retryConfig = retryConfig;
  }

  public async executeWithRetry<T extends Transaction>(
    transaction: T,
    wallet: Wallet,
    operationName: string = "Transaction"
  ): Promise<TransactionResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          this.logger.debug(
            `Retry attempt ${attempt}/${this.retryConfig.maxRetries} for ${operationName} after ${delay}ms`
          );
          await this.sleep(delay);
        }

        const frozenTx = await transaction.freezeWithSigner(wallet);
        const signedTx = await frozenTx.signWithSigner(wallet);
        const response = await signedTx.executeWithSigner(wallet);
        const receipt = await response.getReceiptWithSigner(wallet);

        const duration = Date.now() - startTime;

        this.logger.debug(
          `${operationName} completed successfully in ${duration}ms (attempt ${attempt + 1})`
        );

        return {
          success: true,
          receipt,
          timestamp: startTime,
          duration,
          transactionId: response.transactionId.toString(),
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `${operationName} failed on attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}`,
          { error: (error as Error).message }
        );

        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        if (!this.isRetryableError(error as Error)) {
          this.logger.error(`Non-retryable error encountered for ${operationName}`, error as Error);
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    const wrappedError = this.errorHandler.handleError(
      lastError!,
      `${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts`
    );

    return {
      success: false,
      error: wrappedError,
      timestamp: startTime,
      duration,
    };
  }

  public async executeBatch<T extends Transaction>(
    transactions: T[],
    wallet: Wallet,
    operationName: string = "Batch"
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch of ${transactions.length} transactions for ${operationName}`);

    const results: TransactionResult[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const result = await this.executeWithRetry(
        transactions[i],
        wallet,
        `${operationName}[${i}]`
      );
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.info(
      `Batch ${operationName} completed: ${successCount}/${transactions.length} successful`
    );

    return results;
  }

  public async executeParallel<T extends Transaction>(
    transactions: T[],
    wallet: Wallet,
    operationName: string = "Parallel",
    maxConcurrency: number = 10
  ): Promise<TransactionResult[]> {
    this.logger.info(
      `Executing ${transactions.length} transactions in parallel (max concurrency: ${maxConcurrency})`
    );

    const results: TransactionResult[] = [];
    const chunks = this.chunkArray(transactions, maxConcurrency);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await Promise.all(
        chunk.map((tx, idx) =>
          this.executeWithRetry(tx, wallet, `${operationName}[${i * maxConcurrency + idx}]`)
        )
      );
      results.push(...chunkResults);

      this.logger.debug(
        `Completed chunk ${i + 1}/${chunks.length} (${results.length}/${transactions.length} total)`
      );
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.info(
      `Parallel ${operationName} completed: ${successCount}/${transactions.length} successful`
    );

    return results;
  }

  private calculateDelay(attempt: number): number {
    return (
      this.retryConfig.retryDelay *
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1)
    );
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      "BUSY",
      "TIMEOUT",
      "RECEIPT_NOT_FOUND",
      "PLATFORM_TRANSACTION_NOT_CREATED",
      "NETWORK_ERROR",
    ];

    const errorMessage = error.message.toUpperCase();
    return retryableErrors.some((retryable) => errorMessage.includes(retryable));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
