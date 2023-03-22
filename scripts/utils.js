import { Client, LocalProvider, Wallet } from "@hashgraph/sdk";
import dotenv from "dotenv";

dotenv.config();

export class Utils {
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
}