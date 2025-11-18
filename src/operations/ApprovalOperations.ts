import {
  Wallet,
  AccountAllowanceApproveTransaction,
  NftId,
  TokenId,
  AccountId,
  PrivateKey,
} from "@hashgraph/sdk";
import { BaseOperation } from "./BaseOperation.js";
import { TransactionResult } from "../types/index.js";

export class ApprovalOperations extends BaseOperation {
  public getName(): string {
    return "ApprovalOperations";
  }

  public async approveTokenAllowance(
    wallet: Wallet,
    ownerAccountId: AccountId,
    ownerPrivateKey: PrivateKey,
    spenderAccountId: AccountId,
    tokenId: TokenId,
    amount: number
  ): Promise<TransactionResult> {
    this.logger.info(
      `Approving ${amount} tokens of ${tokenId.toString()} for spender ${spenderAccountId.toString()}`
    );

    const transaction = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(tokenId, ownerAccountId, spenderAccountId, amount);

    let frozenTx = await transaction.freezeWithSigner(wallet);
    frozenTx = await frozenTx.sign(ownerPrivateKey);

    const signedTx = await frozenTx.signWithSigner(wallet);
    const response = await signedTx.executeWithSigner(wallet);
    const receipt = await response.getReceiptWithSigner(wallet);

    const result: TransactionResult = {
      success: true,
      receipt,
      timestamp: Date.now(),
      duration: 0,
      transactionId: response.transactionId.toString(),
    };

    this.logSuccess("Token allowance approval", {
      owner: ownerAccountId.toString(),
      spender: spenderAccountId.toString(),
      tokenId: tokenId.toString(),
      amount,
    });

    return result;
  }

  public async approveNFTAllowance(
    wallet: Wallet,
    ownerAccountId: AccountId,
    ownerPrivateKey: PrivateKey,
    spenderAccountId: AccountId,
    tokenId: TokenId,
    serial: any
  ): Promise<TransactionResult> {
    this.logger.info(
      `Approving NFT ${tokenId.toString()}#${serial.toString()} for spender ${spenderAccountId.toString()}`
    );

    const nftId = new NftId(tokenId, serial);
    const transaction = new AccountAllowanceApproveTransaction()
      .approveTokenNftAllowance(nftId, ownerAccountId, spenderAccountId);

    let frozenTx = await transaction.freezeWithSigner(wallet);
    frozenTx = await frozenTx.sign(ownerPrivateKey);

    const signedTx = await frozenTx.signWithSigner(wallet);
    const response = await signedTx.executeWithSigner(wallet);
    const receipt = await response.getReceiptWithSigner(wallet);

    const result: TransactionResult = {
      success: true,
      receipt,
      timestamp: Date.now(),
      duration: 0,
      transactionId: response.transactionId.toString(),
    };

    this.logSuccess("NFT allowance approval", {
      owner: ownerAccountId.toString(),
      spender: spenderAccountId.toString(),
      nftId: `${tokenId.toString()}#${serial.toString()}`,
    });

    return result;
  }

  public async batchApproveTokenAllowances(
    wallet: Wallet,
    approvals: Array<{
      ownerAccountId: AccountId;
      ownerPrivateKey: PrivateKey;
      spenderAccountId: AccountId;
      tokenId: TokenId;
      amount: number;
    }>
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch of ${approvals.length} token allowance approvals`);

    const results: TransactionResult[] = [];

    for (const approval of approvals) {
      const result = await this.approveTokenAllowance(
        wallet,
        approval.ownerAccountId,
        approval.ownerPrivateKey,
        approval.spenderAccountId,
        approval.tokenId,
        approval.amount
      );
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.info(
      `Batch token approval completed: ${successCount}/${approvals.length} successful`
    );

    return results;
  }

  public async batchApproveNFTAllowances(
    wallet: Wallet,
    approvals: Array<{
      ownerAccountId: AccountId;
      ownerPrivateKey: PrivateKey;
      spenderAccountId: AccountId;
      tokenId: TokenId;
      serial: any;
    }>
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch of ${approvals.length} NFT allowance approvals`);

    const results: TransactionResult[] = [];

    for (const approval of approvals) {
      const result = await this.approveNFTAllowance(
        wallet,
        approval.ownerAccountId,
        approval.ownerPrivateKey,
        approval.spenderAccountId,
        approval.tokenId,
        approval.serial
      );
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.info(
      `Batch NFT approval completed: ${successCount}/${approvals.length} successful`
    );

    return results;
  }
}
