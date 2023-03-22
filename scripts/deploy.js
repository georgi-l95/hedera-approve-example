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

    const alice = await Utils.createAccount(wallet);

    const contractId = await Utils.deployContract(wallet);
    const tokenId = await Utils.createHTSToken(wallet);
    const nftTokenId = await Utils.createNFTToken(wallet);

    const nftCollection = await Utils.mintNFT(wallet, nftTokenId);

    await Utils.tokenAssociate(wallet, alice.accountId, alice.accountKey, [tokenId, nftTokenId]);
    await Utils.tokenAssociate(wallet, contractId, null, [tokenId, nftTokenId], true);
    
    await Utils.transferToken(wallet, alice.accountId, tokenId, 50);
    await Utils.transferNFTs(wallet, wallet.accountId, alice.accountId, nftTokenId, nftCollection);

    await Utils.approveToken(wallet, alice, contractId.num, tokenId, 10);
    await Utils.approveNFTToken(wallet, alice, contractId.num, nftTokenId, nftCollection[0].serials[0]);
    process.exit();
}

deploy();