import {
  Wallet,
  FileCreateTransaction,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  FileId,
} from "@hashgraph/sdk";
import { BaseOperation } from "./BaseOperation.js";
import { TransactionResult } from "../types/index.js";

export class ContractOperations extends BaseOperation {
  public getName(): string {
    return "ContractOperations";
  }

  public async deployContract(
    wallet: Wallet,
    bytecode: string,
    gas: number = 100000,
    constructorParams?: ContractFunctionParameters
  ): Promise<ContractId> {
    this.logger.info("Deploying smart contract");

    const fileTransaction = new FileCreateTransaction()
      .setKeys([wallet.getAccountKey()])
      .setContents(bytecode);

    const fileResult = await this.executor.executeWithRetry(
      fileTransaction,
      wallet,
      "Upload contract bytecode"
    );

    await this.waitForReceipt(fileResult);

    const fileId = fileResult.receipt!.fileId!;
    this.logger.debug(`Contract bytecode uploaded to file: ${fileId.toString()}`);

    const contractTransaction = new ContractCreateTransaction()
      .setGas(gas)
      .setBytecodeFileId(fileId)
      .setAdminKey(wallet.getAccountKey());

    if (constructorParams) {
      contractTransaction.setConstructorParameters(constructorParams);
    }

    const contractResult = await this.executor.executeWithRetry(
      contractTransaction,
      wallet,
      "Create contract"
    );

    await this.waitForReceipt(contractResult);

    const contractId = contractResult.receipt!.contractId!;
    this.logSuccess("Contract deployment", {
      contractId: contractId.toString(),
      fileId: fileId.toString(),
    });

    return contractId;
  }

  public async executeContractFunction(
    wallet: Wallet,
    contractId: ContractId,
    functionName: string,
    params?: ContractFunctionParameters,
    gas: number = 100000
  ): Promise<TransactionResult> {
    this.logger.debug(
      `Executing contract function: ${functionName} on contract ${contractId.toString()}`
    );

    const transaction = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gas)
      .setFunction(functionName, params);

    const result = await this.executor.executeWithRetry(
      transaction,
      wallet,
      `Execute contract function ${functionName}`
    );

    if (result.success) {
      this.logSuccess("Contract function execution", {
        contractId: contractId.toString(),
        functionName,
      });
    } else {
      this.logFailure("Contract function execution", result.error!);
    }

    return result;
  }

  public async batchExecuteContractFunctions(
    wallet: Wallet,
    executions: Array<{
      contractId: ContractId;
      functionName: string;
      params?: ContractFunctionParameters;
      gas?: number;
    }>
  ): Promise<TransactionResult[]> {
    this.logger.info(`Executing batch of ${executions.length} contract function calls`);

    const transactions = executions.map((exec) =>
      new ContractExecuteTransaction()
        .setContractId(exec.contractId)
        .setGas(exec.gas || 100000)
        .setFunction(exec.functionName, exec.params)
    );

    return await this.executor.executeBatch(
      transactions,
      wallet,
      "Contract batch execution"
    );
  }
}
