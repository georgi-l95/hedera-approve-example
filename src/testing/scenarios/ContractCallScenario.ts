import { TestScenario } from "../TestScenario.js";
import { Logger } from "../../utils/Logger.js";
import { ErrorHandler } from "../../utils/ErrorHandler.js";
import { ContractOperations } from "../../operations/ContractOperations.js";
import { TransactionExecutor } from "../../core/TransactionExecutor.js";
import { ContractId, ContractFunctionParameters } from "@hashgraph/sdk";
import stateful from "../../../contracts/statefulContract.json" assert { type: "json" };

export class ContractCallScenario extends TestScenario {
  private contractOps!: ContractOperations;
  private executor!: TransactionExecutor;
  private contractId!: ContractId;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    super(logger, errorHandler);
  }

  public getName(): string {
    return "contract-call";
  }

  public getDescription(): string {
    return "Tests smart contract function execution";
  }

  protected async setup(): Promise<void> {
    this.logger.info("Setting up contract call scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    this.executor = new TransactionExecutor(
      this.logger,
      this.errorHandler,
      { maxRetries: 3, retryDelay: 1000, backoffMultiplier: 2 }
    );

    this.contractOps = new ContractOperations(
      this.logger,
      this.errorHandler,
      this.executor
    );

    const contractByteCode = stateful.object as string;
    this.contractId = await this.contractOps.deployContract(
      this.context.wallet,
      contractByteCode,
      100000,
      new ContractFunctionParameters().addString("hello from hedera!")
    );

    this.logger.info("Contract call scenario setup complete");
  }

  protected async execute(): Promise<void> {
    this.logger.info("Executing contract call scenario");

    if (!this.context) {
      throw new Error("Context not initialized");
    }

    for (let i = 0; i < 15; i++) {
      const params = new ContractFunctionParameters().addString(`message_${i}`);

      const result = await this.contractOps.executeContractFunction(
        this.context.wallet,
        this.contractId,
        "set_message",
        params,
        100000
      );

      this.metricsCollector.recordTransaction(result);
    }

    this.logger.info("Contract call scenario execution complete");
  }

  protected async teardown(): Promise<void> {
    this.logger.info("Tearing down contract call scenario");
  }
}
