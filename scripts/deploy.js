import {
    Wallet,
    LocalProvider,
    ContractCreateTransaction,
    ContractExecuteTransaction,
    FileCreateTransaction,
    ContractFunctionParameters,
    ContractCallQuery,
    Hbar,
    Client,
    PrivateKey
} from "@hashgraph/sdk";

import { Utils } from "./utils.js";

import dotenv from "dotenv";

dotenv.config();

async function deploy() {
    if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
        throw new Error(
            "Environment variables OPERATOR_ID, and OPERATOR_KEY are required."
        );
    }
    const wallet = Utils.initWallet(process.env.OPERATOR_ID, process.env.OPERATOR_KEY, Utils.initClient())
    const accountKey = PrivateKey.generateECDSA();
    // const accountKey1 = PrivateKey.fromStringECDSA();
    // console.log(accountKey.toStringRaw());
    const alias = accountKey.publicKey.toEvmAddress();
    const alice = await Utils.transferAccountEvm(wallet,process.env.OPERATOR_ID, alias );
// await Utils.transferAccountEvm(wallet,process.env.OPERATOR_ID, alias );
    // await Utils.ethereumTransactionDispatch(wallet, accountKey);
    // await Utils.ethereumTransactionDispatch(wallet, accountKey);
    // await Utils.ethereumTransactionDispatch(wallet, accountKey);
    await Utils.deleteAccount(wallet, alice.accountId, accountKey);
    const bob = await Utils.transferAccountEvm(wallet,process.env.OPERATOR_ID, alias );
    // const bob = await Utils.createAccount(wallet, "0x9326f0Aa42aBa1eD2fC3E55f59AB86D741dF5068")
    // const contractId = await Utils.deployContract(wallet);
    // const tokenId = await Utils.createHTSToken(wallet);
    // const nftTokenId = await Utils.createNFTToken(wallet);

    // const nftCollection = await Utils.mintNFT(wallet, nftTokenId);

    // await Utils.tokenAssociate(wallet, alice.accountId, alice.accountKey, [tokenId, nftTokenId]);
    // await Utils.tokenAssociate(wallet, contractId, null, [tokenId, nftTokenId], true);
    
    // await Utils.transferToken(wallet, alice.accountId, tokenId, 50);
    // await Utils.transferNFTs(wallet, wallet.accountId, alice.accountId, nftTokenId, nftCollection);

    // await Utils.approveToken(wallet, alice, contractId.num, tokenId, 10);
    // await Utils.approveNFTToken(wallet, alice, contractId.num, nftTokenId, nftCollection[0].serials[0]);
    process.exit();
}

deploy();