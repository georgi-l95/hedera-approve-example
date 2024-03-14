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
  const accountKey = PrivateKey.generateECDSA();
  const alias = accountKey.publicKey.toEvmAddress();
  const alice = await Utils.transferAccountEvm(
    wallet,
    process.env.OPERATOR_ID,
    alias
  );
  await Utils.deleteAccount(wallet, alice.accountId, accountKey);
  // const bob = await Utils.transferAccountEvm(wallet,process.env.OPERATOR_ID, alias );
  const bob = await Utils.createAccount(wallet, alias, accountKey);
  process.exit();
}

deploy();
