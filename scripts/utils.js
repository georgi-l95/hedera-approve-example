import { Client, ContractCreateTransaction, ContractFunctionParameters, FileCreateTransaction, LocalProvider, TokenAssociateTransaction, TokenCreateTransaction, TokenMintTransaction, TokenSupplyType, TokenType, Wallet } from "@hashgraph/sdk";
import dotenv from "dotenv";
import stateful from "../contracts/statefulContract.json" assert { type: "json" };

dotenv.config();

export class Utils {
    static CID = [
        "QmNPCiNA3Dsu3K5FxDPMG5Q3fZRwVTg14EXA92uqEeSRXn",
        "QmZ4dgAgt8owvnULxnKxNe8YqpavtVCXmc1Lt2XajFpJs9",
        "QmPzY5GxevjyfMUF5vEAjtyRoigzWp47MiKAtLBduLMC1T",
    ];

    static initClient() {
        let client;
        const network = process.env.HEDERA_NETWORK || '{}';
        if (process.env.SUPPORTED_ENV.includes(network.toLowerCase())) {
            client = Client.forName(network);
        } else {
            client = Client.forNetwork(JSON.parse(network));
        }
        return client;
    }
    
    static initWallet(id, key, client) {
        return new Wallet(
            id,
            key,
            new LocalProvider({client: client})
        );
    }
    
    static async createHTSToken(wallet) {
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

    static async createNFTToken(wallet) {
        let nftCreateTx = new TokenCreateTransaction()
        .setTokenName("NFT Token")
        .setTokenSymbol("NFTT")
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setMaxSupply(this.CID.length)
        .setTreasuryAccountId(wallet.getAccountId())
        .setSupplyType(TokenSupplyType.Finite)
        .setAdminKey(wallet.getAccountKey())
        .setSupplyKey(wallet.getAccountKey())
        .freezeWithSigner(wallet);

        let nftCreateTxSign = await (await nftCreateTx).signWithSigner(wallet);
        let nftCreateSubmit = await nftCreateTxSign.executeWithSigner(wallet);
        let nftCreateRx = await nftCreateSubmit.getReceiptWithSigner(wallet);
        let nftTokenId = nftCreateRx.tokenId;

        console.log(`Created NFT with tokenId: ${nftTokenId.toString()}`);
        return nftTokenId;
    }

    static async mintNFT(wallet, nftTokenId) {
        const nftCollection = [];
        for (var i = 0; i < this.CID.length; i++) {
            nftCollection[i] = await (
                await this.tokenMinterFcn(this.CID[i], wallet, nftTokenId.toString())
            ).getReceiptWithSigner(wallet);
            console.log(
                `Created NFT ${nftTokenId.toString()} with serial: ${nftCollection[
                    i
                ].serials[0].toString()}`
            );
        }
        return nftCollection;
    }

    static async tokenAssociate(wallet, contractId, tokenIds) {
        await (
            await (
                await (
                    await new TokenAssociateTransaction()
                        .setAccountId(contractId.toString())
                        .setTokenIds(tokenIds)
                        .freezeWithSigner(wallet)
                ).signWithSigner(wallet)
            ).executeWithSigner(wallet)
        ).getReceiptWithSigner(wallet);
    
        for (let index = 0; index < tokenIds.length; index++) {
            console.log(
                `Associated account ${contractId.toString()} with token ${tokenIds[index].toString()}`
            );
        }
    }

    static async deployContract(wallet) {
        const contractByteCode = /** @type {string} */ (stateful.object);

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

        console.log(`Deployed new Contract with contractId: ${contractId.toString()}`);
        return contractId;
    }

    /**
     * TOKEN MINTER FUNCTION
     *
     * @param {string} CID
     * @param {string} nftTokenId
     */
    static async tokenMinterFcn(CID, wallet, nftTokenId) {
        const mintTx = new TokenMintTransaction()
            .setTokenId(nftTokenId)
            .setMetadata([Buffer.from(CID)])
            .freezeWithSigner(wallet);
        let mintTxSign = await (await mintTx).signWithSigner(wallet);
        return await mintTxSign.executeWithSigner(wallet);
    }
}