import { TestScenario } from "../TestScenario.js";
import { Logger } from "../../utils/Logger.js";
import { ErrorHandler } from "../../utils/ErrorHandler.js";
import { TokenOperations } from "../../operations/TokenOperations.js";
import { AccountManager } from "../../core/AccountManager.js";
import { TransactionExecutor } from "../../core/TransactionExecutor.js";
import { TokenId, AccountId } from "@hashgraph/sdk";
import { AccountInfo } from "../../types/index.js";

export class TokenTransferScenario extends TestScenario {
  private tokenOps!: TokenOperations;
  private accountManager!: AccountManager;
  private executor!: TransactionExecutor;
  private testAccounts: AccountInfo[] = [];
  private tokenId!: TokenId;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    super(logger, errorHandler);
  }

  public getName(): string {
    return "token-transfer";
  }

  public getDescription(): string {
    return "Tests fungible token transfers between accounts";
  }

  protected async setup(): Promise<void> {
    this.logger.info("Setting up token transfer scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    this.executor = new TransactionExecutor(
      this.logger,
      this.errorHandler,
      { maxRetries: 3, retryDelay: 1000, backoffMultiplier: 2 }
    );

    this.tokenOps = new TokenOperations(this.logger, this.errorHandler, this.executor);
    this.accountManager = new AccountManager(this.logger, this.errorHandler);

    this.tokenId = await this.tokenOps.createFungibleToken(
      this.context.wallet,
      "Test Token",
      "TEST",
      2,
      10000
    );

    this.logger.info("Creating test accounts");
    this.testAccounts = await this.accountManager.createMultipleAccounts(
      this.context.wallet,
      5,
      10
    );

    for (const account of this.testAccounts) {
      await this.tokenOps.associateToken(
        this.context.wallet,
        account.accountId,
        [this.tokenId]
      );

      await this.tokenOps.transferTokens(
        this.context.wallet,
        this.tokenId,
        this.context.wallet.getAccountId(),
        account.accountId,
        100
      );
    }

    this.logger.info("Token transfer scenario setup complete");
  }

  protected async execute(): Promise<void> {
    this.logger.info("Executing token transfer scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    for (let i = 0; i < 20; i++) {
      const fromAccount = this.testAccounts[i % this.testAccounts.length];
      const toAccount = this.testAccounts[(i + 1) % this.testAccounts.length];

      const result = await this.tokenOps.transferTokens(
        this.context.wallet,
        this.tokenId,
        fromAccount.accountId,
        toAccount.accountId,
        10
      );

      this.metricsCollector.recordTransaction(result);
    }

    this.logger.info("Token transfer scenario execution complete");
  }

  protected async teardown(): Promise<void> {
    this.logger.info("Tearing down token transfer scenario");
    this.accountManager.clearAccounts();
  }
}
