import {
  AccountId,
  Client,
  ContractCreateTransaction,
  ContractFunctionParameters,
  FileCreateTransaction,
  LocalProvider,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TransferTransaction,
  Wallet,
} from "@hashgraph/sdk";
import hre from "hardhat";

describe("reward", async function () {
  function initClient() {
    let client;
    const network = process.env.HEDERA_NETWORK || "{}";
    if (process.env.SUPPORTED_ENV.includes(network.toLowerCase())) {
      client = Client.forName(network);
    } else {
      client = Client.forNetwork(JSON.parse(network));
    }
    return client;
  }

  function initWallet(id, key, client) {
    return new Wallet(id, key, new LocalProvider({ client: client }));
  }

  async function deployContract(wallet) {
    const contractByteCode = /** @type {string} */ (
      "608060405234801561001057600080fd5b50610301806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80631e83409a1461003b5780635afd86a81461006b575b600080fd5b610055600480360381019061005091906101cd565b610089565b6040516100629190610213565b60405180910390f35b610073610161565b6040516100809190610213565b60405180910390f35b6000600190508173ffffffffffffffffffffffffffffffffffffffff1663a9059cbb33836040518363ffffffff1660e01b81526004016100ca92919061023d565b6020604051808303816000875af11580156100e9573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061010d919061029e565b503373ffffffffffffffffffffffffffffffffffffffff167f47cee97cb7acd717b3c0aa1435d004cd5b3c8c57d70dbceb4e4458bbd60e39d4826040516101549190610213565b60405180910390a2919050565b60006032905090565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061019a8261016f565b9050919050565b6101aa8161018f565b81146101b557600080fd5b50565b6000813590506101c7816101a1565b92915050565b6000602082840312156101e3576101e261016a565b5b60006101f1848285016101b8565b91505092915050565b6000819050919050565b61020d816101fa565b82525050565b60006020820190506102286000830184610204565b92915050565b6102378161018f565b82525050565b6000604082019050610252600083018561022e565b61025f6020830184610204565b9392505050565b60008115159050919050565b61027b81610266565b811461028657600080fd5b50565b60008151905061029881610272565b92915050565b6000602082840312156102b4576102b361016a565b5b60006102c284828501610289565b9150509291505056fea2646970667358221220184d123d5ec16236e804060d648a698d16437057ea674aac46432bb65baac8c664736f6c63430008120033"
    );

    let transaction = await new FileCreateTransaction()
      .setKeys([wallet.getAccountKey()])
      .setContents(contractByteCode)
      .freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    const fileTransactionResponse = await transaction.executeWithSigner(wallet);

    const fileReceipt = await fileTransactionResponse.getReceiptWithSigner(
      wallet
    );

    const fileId = fileReceipt.fileId;

    transaction = await new ContractCreateTransaction()
      .setConstructorParameters(
        new ContractFunctionParameters().addString("hello from hedera!")
      )
      .setGas(100000)
      .setBytecodeFileId(fileId)
      .setAdminKey(wallet.getAccountKey())
      .freezeWithSigner(wallet);
    transaction = await transaction.signWithSigner(wallet);
    const contractTransactionResponse = await transaction.executeWithSigner(
      wallet
    );

    const contractReceipt =
      await contractTransactionResponse.getReceiptWithSigner(wallet);

    const contractId = contractReceipt.contractId;

    console.log(
      `Deployed new Contract with contractId: ${contractId.toString()}`
    );
    return contractId;
  }

  async function tokenAssociate(
    wallet,
    accountId,
    accountKey,
    tokenIds,
    clientOwned = false
  ) {
    let transaction = await new TokenAssociateTransaction()
      .setAccountId(accountId.toString())
      .setTokenIds(tokenIds)
      .freezeWithSigner(wallet);
    if (!clientOwned) {
      transaction.sign(accountKey);
    }
    await (
      await (await transaction.signWithSigner(wallet)).executeWithSigner(wallet)
    ).getReceiptWithSigner(wallet);

    for (let index = 0; index < tokenIds.length; index++) {
      console.log(
        `Associated account ${accountId.toString()} with token ${tokenIds[
          index
        ].toString()}`
      );
    }
  }

  async function createHTSToken(wallet) {
    let transaction = await new TokenCreateTransaction()
      .setTokenName("ffff")
      .setTokenSymbol("F")
      .setDecimals(3)
      .setInitialSupply(100)
      .setTreasuryAccountId(wallet.getAccountId())
      .setAdminKey(wallet.getAccountKey())
      .setFreezeKey(wallet.getAccountKey())
      .setWipeKey(wallet.getAccountKey())
      .setSupplyKey(wallet.getAccountKey())
      .setFreezeDefault(false)
      .freezeWithSigner(wallet);

    transaction = await transaction.signWithSigner(wallet);
    const resp = await transaction.executeWithSigner(wallet);

    const tokenId = (await resp.getReceiptWithSigner(wallet)).tokenId;
    console.log(`Created HTS with tokenId: ${tokenId.toString()}`);
    return tokenId;
  }

  async function transferToken(wallet, accountId, tokenId, amount) {
    await (
      await (
        await (
          await new TransferTransaction()
            .addTokenTransfer(tokenId, wallet.getAccountId(), -amount)
            .addTokenTransfer(tokenId, accountId, amount)
            .freezeWithSigner(wallet)
        ).signWithSigner(wallet)
      ).executeWithSigner(wallet)
    ).getReceiptWithSigner(wallet);

    console.log(
      `Sent ${amount} tokens from account ${wallet
        .getAccountId()
        .toString()} to account ${accountId.toString()} on token ${tokenId.toString()}`
    );
  }

  it("should execute claim(token)", async () => {
    if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
      throw new Error(
        "Environment variables OPERATOR_ID, and OPERATOR_KEY are required."
      );
    }
    const wallet = initWallet(
      process.env.OPERATOR_ID,
      process.env.OPERATOR_KEY,
      initClient()
    );

    const contractId = await deployContract(wallet);
    const tokenId = await createHTSToken(wallet);
    const tokenAddress = `0x${tokenId.toSolidityAddress()}`;
    const contractAddress = `0x${contractId.toSolidityAddress()}`;
    await tokenAssociate(
      wallet,
      AccountId.fromString("0.0.1012"),
      PrivateKey.fromStringECDSA(
        "0x105d050185ccb907fba04dd92d8de9e32c18305e097ab41dadda21489a211524"
      ),
      [tokenId]
    );
    await tokenAssociate(
      wallet,
      AccountId.fromString("0.0.1013"),
      PrivateKey.fromStringECDSA(
        "0x2e1d968b041d84dd120a5860cee60cd83f9374ef527ca86996317ada3d0d03e7"
      ),
      [tokenId]
    );
    await tokenAssociate(wallet, contractId, null, [tokenId], true);
    await transferToken(
      wallet,
      AccountId.fromString(contractAddress),
      tokenId,
      100
    );
    const signer = (await hre.ethers.getSigners())[0];
    const signer2 = (await hre.ethers.getSigners())[1];

    const reward = await hre.ethers.getContractAt(
      "Reward",
      contractAddress,
      signer
    );

    const txClaim = await reward
      .connect(signer2)
      .callStatic.claim(tokenAddress, { gasLimit: 1_000_000 });
    // console.log(await txClaim.wait());
    console.log(txClaim);
  });
});
