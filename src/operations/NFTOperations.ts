import {
  Wallet,
  TokenCreateTransaction,
  TokenMintTransaction,
  TransferTransaction,
  TokenType,
  TokenSupplyType,
  TokenId,
  AccountId,
} from "@hashgraph/sdk";
import { BaseOperation } from "./BaseOperation.js";
import { TransactionResult } from "../types/index.js";

export class NFTOperations extends BaseOperation {
  public getName(): string {
    return "NFTOperations";
  }

  public async createNFTCollection(
    wallet: Wallet,
    tokenName: string,
    tokenSymbol: string,
    maxSupply: number
  ): Promise<TokenId> {
    this.logger.info(`Creating NFT collection: ${tokenName} (${tokenSymbol})`);

    const transaction = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setInitialSupply(0)
      .setMaxSupply(maxSupply)
      .setTreasuryAccountId(wallet.getAccountId())
      .setSupplyType(TokenSupplyType.Finite)
      .setAdminKey(wallet.getAccountKey())
      .setSupplyKey(wallet.getAccountKey());

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Create NFT collection ${tokenName}`
    );

    await this.waitForReceipt(result);

    const tokenId = result.receipt!.tokenId!;
    this.logSuccess("NFT collection creation", {
      tokenId: tokenId.toString(),
      tokenName,
      maxSupply,
    });

    return tokenId;
  }

  public async mintNFT(
    wallet: Wallet,
    tokenId: TokenId,
    metadata: string
  ) {
    this.logger.debug(`Minting NFT with metadata: ${metadata.substring(0, 20)}...`);

    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setMetadata([Buffer.from(metadata)]);

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Mint NFT on token ${tokenId.toString()}`
    );

    await this.waitForReceipt(result);

    const serial = result.receipt!.serials[0];
    this.logSuccess("NFT mint", {
      tokenId: tokenId.toString(),
      serial: serial.toString(),
    });

    return serial;
  }

  public async mintMultipleNFTs(
    wallet: Wallet,
    tokenId: TokenId,
    metadataList: string[]
  ) {
    this.logger.info(`Minting ${metadataList.length} NFTs on token ${tokenId.toString()}`);

    const serials: any[] = [];

    for (const metadata of metadataList) {
      const serial = await this.mintNFT(wallet, tokenId, metadata);
      serials.push(serial);
    }

    this.logger.info(`Successfully minted ${serials.length} NFTs`);
    return serials;
  }

  public async transferNFT(
    wallet: Wallet,
    tokenId: TokenId,
    serial: any,
    fromAccountId: AccountId,
    toAccountId: AccountId
  ): Promise<TransactionResult> {
    this.logger.debug(
      `Transferring NFT ${tokenId.toString()}#${serial.toString()} from ${fromAccountId.toString()} to ${toAccountId.toString()}`
    );

    const transaction = new TransferTransaction().addNftTransfer(
      tokenId,
      serial,
      fromAccountId,
      toAccountId
    );

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Transfer NFT ${tokenId.toString()}#${serial.toString()}`
    );

    if (result.success) {
      this.logSuccess("NFT transfer", {
        tokenId: tokenId.toString(),
        serial: serial.toString(),
        from: fromAccountId.toString(),
        to: toAccountId.toString(),
      });
    } else {
      this.logFailure("NFT transfer", result.error!);
    }

    return result;
  }

  public async batchTransferNFTs(
    wallet: Wallet,
    transfers: Array<{
      tokenId: TokenId;
      serial: any;
      fromAccountId: AccountId;
      toAccountId: AccountId;
    }>
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch transfer of ${transfers.length} NFTs`);

    const transactions = transfers.map((transfer) =>
      new TransferTransaction().addNftTransfer(
        transfer.tokenId,
        transfer.serial,
        transfer.fromAccountId,
        transfer.toAccountId
      )
    );

    return await this.executor.executeBatch(transactions, wallet, "NFT batch transfer");
  }
}
