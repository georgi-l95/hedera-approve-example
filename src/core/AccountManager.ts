import {
  Wallet,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
} from "@hashgraph/sdk";
import { AccountInfo } from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { ErrorHandler } from "../utils/ErrorHandler.js";

export class AccountManager {
  private readonly logger: Logger;
  private readonly errorHandler: ErrorHandler;
  private accounts: Map<string, AccountInfo> = new Map();

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  public async createAccount(
    wallet: Wallet,
    initialBalance: number = 5,
    keyType: 'ED25519' | 'ECDSA' = 'ED25519'
  ): Promise<AccountInfo> {
    try {
      this.logger.debug(`Creating new account with initial balance: ${initialBalance} HBAR`);

      const privateKey = keyType === 'ED25519'
        ? PrivateKey.generateED25519()
        : PrivateKey.generateECDSA();

      let transaction = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(new Hbar(initialBalance))
        .freezeWithSigner(wallet);

      transaction = await transaction.signWithSigner(wallet);
      const response = await transaction.executeWithSigner(wallet);
      const receipt = await response.getReceiptWithSigner(wallet);

      if (!receipt.accountId) {
        throw new Error("Account creation failed: no account ID in receipt");
      }

      const accountInfo: AccountInfo = {
        accountId: receipt.accountId,
        privateKey,
      };

      this.accounts.set(receipt.accountId.toString(), accountInfo);
      this.logger.info(`Created account: ${receipt.accountId.toString()}`);

      return accountInfo;
    } catch (error) {
      const wrappedError = this.errorHandler.handleError(
        error as Error,
        "Account creation failed"
      );
      throw wrappedError;
    }
  }

  public async createMultipleAccounts(
    wallet: Wallet,
    count: number,
    initialBalance: number = 5
  ): Promise<AccountInfo[]> {
    this.logger.info(`Creating ${count} accounts with ${initialBalance} HBAR each`);

    const accounts: AccountInfo[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const account = await this.createAccount(wallet, initialBalance);
        accounts.push(account);

        if ((i + 1) % 10 === 0) {
          this.logger.debug(`Created ${i + 1}/${count} accounts`);
        }
      } catch (error) {
        this.logger.error(`Failed to create account ${i + 1}/${count}`, error as Error);
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Created ${accounts.length}/${count} accounts. ${errors.length} failures.`);
    } else {
      this.logger.info(`Successfully created all ${count} accounts`);
    }

    return accounts;
  }

  public getAccount(accountId: string): AccountInfo | undefined {
    return this.accounts.get(accountId);
  }

  public getAllAccounts(): AccountInfo[] {
    return Array.from(this.accounts.values());
  }

  public getAccountCount(): number {
    return this.accounts.size;
  }

  public clearAccounts(): void {
    this.logger.debug("Clearing all managed accounts");
    this.accounts.clear();
  }
}
