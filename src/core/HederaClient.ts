import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";
import { NetworkConfig } from "../types/index.js";
import { Logger } from "../utils/Logger.js";

export class HederaClient {
  private client: Client | null = null;
  private readonly logger: Logger;
  private readonly operatorId: AccountId;
  private readonly operatorKey: PrivateKey;
  private readonly networkConfig: NetworkConfig;

  constructor(
    operatorId: string,
    operatorKey: string,
    networkConfig: NetworkConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.operatorId = AccountId.fromString(operatorId);
    this.operatorKey = PrivateKey.fromString(operatorKey);
    this.networkConfig = networkConfig;
  }

  public initialize(): Client {
    if (this.client) {
      return this.client;
    }

    this.logger.info(`Initializing Hedera client for network: ${this.networkConfig.name}`);

    try {
      if (this.isPreConfiguredNetwork(this.networkConfig.name)) {
        this.client = Client.forName(this.networkConfig.name);
      } else if (this.networkConfig.nodes) {
        this.client = Client.forNetwork(this.networkConfig.nodes);
      } else {
        throw new Error("Invalid network configuration");
      }

      this.client.setOperator(this.operatorId, this.operatorKey);

      if (this.networkConfig.maxConnections) {
        this.client.setMaxNodeAttempts(this.networkConfig.maxConnections);
      }

      this.logger.info("Hedera client initialized successfully");
      return this.client;
    } catch (error) {
      this.logger.error("Failed to initialize Hedera client", error as Error);
      throw error;
    }
  }

  public getClient(): Client {
    if (!this.client) {
      throw new Error("Client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  public getOperatorId(): AccountId {
    return this.operatorId;
  }

  public getOperatorKey(): PrivateKey {
    return this.operatorKey;
  }

  public async close(): Promise<void> {
    if (this.client) {
      this.logger.info("Closing Hedera client connection");
      await this.client.close();
      this.client = null;
    }
  }

  private isPreConfiguredNetwork(network: string): boolean {
    const preConfiguredNetworks = ['testnet', 'mainnet', 'previewnet'];
    return preConfiguredNetworks.includes(network.toLowerCase());
  }
}
