import { TestScenario } from "../TestScenario.js";
import { Logger } from "../../utils/Logger.js";
import { ErrorHandler } from "../../utils/ErrorHandler.js";
import { TokenOperations } from "../../operations/TokenOperations.js";
import { NFTOperations } from "../../operations/NFTOperations.js";
import { ApprovalOperations } from "../../operations/ApprovalOperations.js";
import { AccountManager } from "../../core/AccountManager.js";
import { TransactionExecutor } from "../../core/TransactionExecutor.js";
import { ContractOperations } from "../../operations/ContractOperations.js";
import { TokenId, ContractId, AccountId } from "@hashgraph/sdk";
import { AccountInfo } from "../../types/index.js";
import stateful from "../../../contracts/statefulContract.json" assert { type: "json" };
import { ContractFunctionParameters } from "@hashgraph/sdk";

export class ApprovalScenario extends TestScenario {
  private tokenOps!: TokenOperations;
  private nftOps!: NFTOperations;
  private approvalOps!: ApprovalOperations;
  private contractOps!: ContractOperations;
  private accountManager!: AccountManager;
  private executor!: TransactionExecutor;
  private testAccounts: AccountInfo[] = [];
  private tokenId!: TokenId;
  private nftTokenId!: TokenId;
  private contractId!: ContractId;
  private nftSerials: any[] = [];

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    super(logger, errorHandler);
  }

  public getName(): string {
    return "approval";
  }

  public getDescription(): string {
    return "Tests token and NFT allowance approvals";
  }

  protected async setup(): Promise<void> {
    this.logger.info("Setting up approval scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    this.executor = new TransactionExecutor(
      this.logger,
      this.errorHandler,
      { maxRetries: 3, retryDelay: 1000, backoffMultiplier: 2 }
    );

    this.tokenOps = new TokenOperations(this.logger, this.errorHandler, this.executor);
    this.nftOps = new NFTOperations(this.logger, this.errorHandler, this.executor);
    this.approvalOps = new ApprovalOperations(this.logger, this.errorHandler, this.executor);
    this.contractOps = new ContractOperations(this.logger, this.errorHandler, this.executor);
    this.accountManager = new AccountManager(this.logger, this.errorHandler);

    const contractByteCode = stateful.object as string;
    this.contractId = await this.contractOps.deployContract(
      this.context.wallet,
      contractByteCode,
      100000,
      new ContractFunctionParameters().addString("hello from hedera!")
    );

    this.tokenId = await this.tokenOps.createFungibleToken(
      this.context.wallet,
      "Approval Test Token",
      "ATT",
      2,
      10000
    );

    this.nftTokenId = await this.nftOps.createNFTCollection(
      this.context.wallet,
      "Approval NFT",
      "ANFT",
      10
    );

    const metadata = ["QmHash1", "QmHash2", "QmHash3"];
    this.nftSerials = await this.nftOps.mintMultipleNFTs(
      this.context.wallet,
      this.nftTokenId,
      metadata
    );

    this.logger.info("Creating test accounts");
    this.testAccounts = await this.accountManager.createMultipleAccounts(
      this.context.wallet,
      3,
      10
    );

    for (const account of this.testAccounts) {
      await this.tokenOps.associateToken(
        this.context.wallet,
        account.accountId,
        [this.tokenId, this.nftTokenId]
      );

      await this.tokenOps.transferTokens(
        this.context.wallet,
        this.tokenId,
        this.context.wallet.getAccountId(),
        account.accountId,
        100
      );
    }

    if (this.testAccounts.length > 0 && this.nftSerials.length > 0) {
      await this.nftOps.transferNFT(
        this.context.wallet,
        this.nftTokenId,
        this.nftSerials[0],
        this.context.wallet.getAccountId(),
        this.testAccounts[0].accountId
      );
    }

    this.logger.info("Approval scenario setup complete");
  }

  protected async execute(): Promise<void> {
    this.logger.info("Executing approval scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    const spenderAccountId = AccountId.fromString(this.contractId.toString());

    for (let i = 0; i < 10; i++) {
      const ownerAccount = this.testAccounts[i % this.testAccounts.length];

      const tokenApprovalResult = await this.approvalOps.approveTokenAllowance(
        this.context.wallet,
        ownerAccount.accountId,
        ownerAccount.privateKey,
        spenderAccountId,
        this.tokenId,
        10
      );

      this.metricsCollector.recordTransaction(tokenApprovalResult);
    }

    if (this.testAccounts.length > 0 && this.nftSerials.length > 0) {
      const nftApprovalResult = await this.approvalOps.approveNFTAllowance(
        this.context.wallet,
        this.testAccounts[0].accountId,
        this.testAccounts[0].privateKey,
        spenderAccountId,
        this.nftTokenId,
        this.nftSerials[0]
      );

      this.metricsCollector.recordTransaction(nftApprovalResult);
    }

    this.logger.info("Approval scenario execution complete");
  }

  protected async teardown(): Promise<void> {
    this.logger.info("Tearing down approval scenario");
    this.accountManager.clearAccounts();
  }
}
