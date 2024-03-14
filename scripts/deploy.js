import { PrivateKey } from "@hashgraph/sdk";

import { Utils } from "./utils.js";

import dotenv from "dotenv";

dotenv.config();

async function deploy() {
  if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
    throw new Error(
      "Environment variables OPERATOR_ID, and OPERATOR_KEY are required."
    );
  }
  const wallet = Utils.initWallet(
    process.env.OPERATOR_ID,
    process.env.OPERATOR_KEY,
    Utils.initClient()
  );
  const accountID = process.env.ACCOUNT_ID;
  const accountKey = PrivateKey.fromStringECDSA(process.env.ACCOUNT_KEY);
  // const accountKey = PrivateKey.generateECDSA();
  // const alias = accountKey.publicKey.toEvmAddress();
  // const alice = await Utils.createAccount(wallet, alias, accountKey);
  await Utils.deleteAccount(wallet, accountID, accountKey);
  // const bob = await Utils.createAccount(wallet, alias, accountKey);
  process.exit();
}

deploy();
