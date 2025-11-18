import { Wallet, LocalProvider, Client } from "@hashgraph/sdk";
import { Logger } from "../utils/Logger.js";

export class WalletManager {
  private readonly logger: Logger;
  private wallets: Map<string, Wallet> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public createWallet(accountId: string, privateKey: string, client: Client): Wallet {
    const walletKey = `${accountId}`;

    if (this.wallets.has(walletKey)) {
      this.logger.debug(`Wallet for account ${accountId} already exists, returning existing wallet`);
      return this.wallets.get(walletKey)!;
    }

    this.logger.debug(`Creating new wallet for account ${accountId}`);

    const wallet = new Wallet(
      accountId,
      privateKey,
      new LocalProvider({ client })
    );

    this.wallets.set(walletKey, wallet);
    return wallet;
  }

  public getWallet(accountId: string): Wallet | undefined {
    return this.wallets.get(accountId);
  }

  public hasWallet(accountId: string): boolean {
    return this.wallets.has(accountId);
  }

  public removeWallet(accountId: string): boolean {
    this.logger.debug(`Removing wallet for account ${accountId}`);
    return this.wallets.delete(accountId);
  }

  public clearAllWallets(): void {
    this.logger.info("Clearing all wallets");
    this.wallets.clear();
  }

  public getWalletCount(): number {
    return this.wallets.size;
  }

  public getAllWallets(): Wallet[] {
    return Array.from(this.wallets.values());
  }
}
