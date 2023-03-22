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

    process.exit();
}

deploy();