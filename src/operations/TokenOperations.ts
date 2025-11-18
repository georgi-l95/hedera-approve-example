import {
  Wallet,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenId,
  AccountId,
} from "@hashgraph/sdk";
import { BaseOperation } from "./BaseOperation.js";
import { TransactionResult } from "../types/index.js";

export class TokenOperations extends BaseOperation {
  public getName(): string {
    return "TokenOperations";
  }

  public async createFungibleToken(
    wallet: Wallet,
    tokenName: string,
    tokenSymbol: string,
    decimals: number,
    initialSupply: number
  ): Promise<TokenId> {
    this.logger.info(`Creating fungible token: ${tokenName} (${tokenSymbol})`);

    const transaction = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setDecimals(decimals)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(wallet.getAccountId())
      .setAdminKey(wallet.getAccountKey())
      .setFreezeKey(wallet.getAccountKey())
      .setWipeKey(wallet.getAccountKey())
      .setSupplyKey(wallet.getAccountKey())
      .setFreezeDefault(false);

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Create token ${tokenName}`
    );

    await this.waitForReceipt(result);

    const tokenId = result.receipt!.tokenId!;
    this.logSuccess("Token creation", { tokenId: tokenId.toString(), tokenName, tokenSymbol });

    return tokenId;
  }

  public async associateToken(
    wallet: Wallet,
    accountId: AccountId,
    tokenIds: TokenId[]
  ): Promise<TransactionResult> {
    this.logger.info(`Associating ${tokenIds.length} token(s) to account ${accountId.toString()}`);

    const transaction = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds(tokenIds);

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Associate tokens to ${accountId.toString()}`
    );

    if (result.success) {
      this.logSuccess("Token association", {
        accountId: accountId.toString(),
        tokenCount: tokenIds.length,
      });
    } else {
      this.logFailure("Token association", result.error!);
    }

    return result;
  }

  public async transferTokens(
    wallet: Wallet,
    tokenId: TokenId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    amount: number
  ): Promise<TransactionResult> {
    this.logger.debug(
      `Transferring ${amount} tokens from ${fromAccountId.toString()} to ${toAccountId.toString()}`
    );

    const transaction = new TransferTransaction()
      .addTokenTransfer(tokenId, fromAccountId, -amount)
      .addTokenTransfer(tokenId, toAccountId, amount);

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Transfer ${amount} of token ${tokenId.toString()}`
    );

    if (result.success) {
      this.logSuccess("Token transfer", {
        tokenId: tokenId.toString(),
        from: fromAccountId.toString(),
        to: toAccountId.toString(),
        amount,
      });
    } else {
      this.logFailure("Token transfer", result.error!);
    }

    return result;
  }

  public async batchTransferTokens(
    wallet: Wallet,
    transfers: Array<{
      tokenId: TokenId;
      fromAccountId: AccountId;
      toAccountId: AccountId;
      amount: number;
    }>
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch transfer of ${transfers.length} token transfers`);

    const transactions = transfers.map((transfer) =>
      new TransferTransaction()
        .addTokenTransfer(transfer.tokenId, transfer.fromAccountId, -transfer.amount)
        .addTokenTransfer(transfer.tokenId, transfer.toAccountId, transfer.amount)
    );

    return await this.executor.executeBatch(transactions, wallet, "Token batch transfer");
  }
}
