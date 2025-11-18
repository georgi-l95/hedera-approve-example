# Hedera Performance Testing Framework

A comprehensive, OOP-based performance and load testing framework for Hedera consensus nodes. Built with TypeScript, this framework enables systematic testing of Hedera network operations including token transfers, NFT operations, smart contract interactions, and allowance approvals.

## Features

- **OOP Architecture**: Clean, maintainable object-oriented design with proper encapsulation
- **Performance Metrics**: Comprehensive metrics collection including TPS, response times (avg, p95, p99)
- **Load Generation**: Support for concurrent load testing with configurable ramp-up periods
- **Multiple Test Scenarios**: Pre-built scenarios for common operations
- **Retry Logic**: Intelligent retry mechanism with exponential backoff
- **Flexible Reporting**: Export results to JSON, CSV, and HTML formats
- **CLI Interface**: Easy-to-use command-line interface
- **TypeScript**: Full type safety and better IDE support
- **Extensible**: Plugin system for custom test scenarios

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure your environment variables:
```env
OPERATOR_ID=0.0.xxxxx
OPERATOR_KEY=your-private-key
HEDERA_NETWORK=testnet
```

See `.env.example` for all available configuration options.

## Building

```bash
npm run build
```

## Usage

### CLI Commands

#### Run a test scenario
```bash
# Basic usage
npm run scenario:token

# With custom options
node dist/cli.js test --scenario token-transfer --concurrency 50 --duration 120

# Iteration-based testing
node dist/cli.js test --scenario approval --iterations 100 --concurrency 10

# Custom output and formats
node dist/cli.js test --scenario contract-call --output ./my-results --formats json,html
```

#### List available scenarios
```bash
node dist/cli.js list
```

### Available Scenarios

1. **token-transfer**: Tests fungible token transfers between accounts
2. **approval**: Tests token and NFT allowance approvals
3. **contract-call**: Tests smart contract function execution

### CLI Options

- `-s, --scenario <name>`: Scenario name to run (default: "token-transfer")
- `-c, --concurrency <number>`: Number of concurrent workers (default: 10)
- `-d, --duration <seconds>`: Test duration in seconds (default: 60)
- `-r, --ramp-up <seconds>`: Ramp-up time in seconds (default: 10)
- `-i, --iterations <number>`: Run specific number of iterations instead of duration
- `-o, --output <directory>`: Output directory for results (default: "./results")
- `-f, --formats <formats>`: Export formats: json,csv,html (default: "json,csv,html")
- `--log-level <level>`: Log level: error,warn,info,debug (default: "info")

## Programmatic Usage

```typescript
import {
  Configuration,
  HederaClient,
  WalletManager,
  Logger,
  ErrorHandler,
  TestRunner,
  TokenTransferScenario,
} from "hedera-perf-framework";

const logger = new Logger("info");
const errorHandler = new ErrorHandler(logger);
const config = new Configuration();

const hederaClient = new HederaClient(
  process.env.OPERATOR_ID!,
  process.env.OPERATOR_KEY!,
  config.getNetworkConfig(),
  logger
);

const client = hederaClient.initialize();
const walletManager = new WalletManager(logger);
const wallet = walletManager.createWallet(
  process.env.OPERATOR_ID!,
  process.env.OPERATOR_KEY!,
  client
);

const testRunner = new TestRunner(logger, errorHandler);
testRunner.registerScenario(new TokenTransferScenario(logger, errorHandler));

const results = await testRunner.runScenario("token-transfer", wallet);
console.log(testRunner.getSummary());
```

## Creating Custom Scenarios

```typescript
import { TestScenario } from "hedera-perf-framework";

export class MyCustomScenario extends TestScenario {
  public getName(): string {
    return "my-custom-scenario";
  }

  public getDescription(): string {
    return "Description of my custom scenario";
  }

  protected async setup(): Promise<void> {
    // Setup code (create accounts, tokens, etc.)
  }

  protected async execute(): Promise<void> {
    // Main test logic
    const result = await this.someOperation();
    this.metricsCollector.recordTransaction(result);
  }

  protected async teardown(): Promise<void> {
    // Cleanup code
  }
}
```

## Architecture

```
src/
├── core/               # Core framework components
│   ├── HederaClient.ts
│   ├── WalletManager.ts
│   ├── AccountManager.ts
│   └── TransactionExecutor.ts
├── operations/         # Operation abstractions
│   ├── BaseOperation.ts
│   ├── TokenOperations.ts
│   ├── NFTOperations.ts
│   ├── ContractOperations.ts
│   └── ApprovalOperations.ts
├── testing/           # Testing framework
│   ├── TestScenario.ts
│   ├── TestRunner.ts
│   ├── LoadGenerator.ts
│   └── scenarios/
├── metrics/           # Metrics and reporting
│   ├── MetricsCollector.ts
│   ├── ResultAggregator.ts
│   └── Reporter.ts
├── config/            # Configuration management
│   └── Configuration.ts
└── utils/             # Utilities
    ├── Logger.ts
    └── ErrorHandler.ts
```

## Metrics Collected

- **Total Transactions**: Total number of transactions executed
- **Success Rate**: Percentage of successful transactions
- **Throughput**: Transactions per second (TPS)
- **Response Times**:
  - Average
  - Minimum
  - Maximum
  - P95 (95th percentile)
  - P99 (99th percentile)
- **Error Distribution**: Most common errors and their counts

## Development

### Running tests
```bash
npm test
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Watch mode
```bash
npm run dev
```

## Legacy Script

The original deployment script is still available:
```bash
npm run deploy
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/georgi-l95/hedera-approve-example/issues) page.
