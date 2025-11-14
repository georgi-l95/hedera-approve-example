# Hedera Approve Example using JS SDK

This project demonstrates a basic Hardhat use case. It comes with a sample contract and a script that deploys that contract using the JS SDK.

To deploy populate `.env` file and run:

```shell
npm install
npm run deploy
```

## Load Testing Capabilities

The repository includes three levels of load testing capabilities:

### Basic Load Testing
Simple single-machine load testing:
```shell
npm run load-test                # uses the built-in defaults
npm run load-test -- ./scenario.json   # runs a custom scenario
```

### Enhanced Load Testing
Advanced features including multiple transaction types, percentile metrics, and export:
```shell
npm run load-test-enhanced       # enhanced version with full features
npm run load-test-enhanced -- scripts/config/scenario.quick-test.json  # 35-second test
```

### Distributed Load Testing (NEW!)
High-scale testing with multiple workers, real-time dashboard, and monitoring:

#### Quick Start with Docker:
```shell
# Start distributed system (coordinator, workers, dashboard)
npm run distributed:start

# Open dashboard at http://localhost:3000
# Configure and run tests via web UI

# View logs
npm run distributed:logs

# Stop system
npm run distributed:stop
```

#### Manual Setup:
```shell
# Terminal 1 - Start Coordinator with Dashboard
npm run coordinator

# Terminal 2 - Start Worker
npm run worker

# Access dashboard at http://localhost:3000
```

### Features Comparison

| Feature | Basic | Enhanced | Distributed |
|---------|-------|----------|------------|
| Transaction Types | HBAR only | HBAR, Token, NFT | All types |
| Metrics | Basic | Percentiles (P50, P95, P99) | Full metrics + streaming |
| Max TPS | ~100 | ~500 | 1000+ |
| Dashboard | No | No | Yes (Real-time web UI) |
| Multi-machine | No | No | Yes |
| Docker Support | No | No | Yes |

### Documentation

- [Quick Start Guide](QUICK_START_GUIDE.md) - Get started quickly
- [Load Test Improvements](LOAD_TEST_IMPROVEMENTS.md) - Enhanced features guide
- [Distributed Testing Guide](DISTRIBUTED_TESTING_GUIDE.md) - Complete distributed testing manual
- [Load Test Summary](LOAD_TEST_SUMMARY.md) - Comprehensive overview

### Dashboard Preview

The distributed testing dashboard provides real-time visualization at http://localhost:3000:
- Live transaction metrics and success rates
- Interactive charts for TPS, latency, and errors
- Worker status monitoring
- Test control panel

### Prerequisites

1. Populate a `.env` file with `OPERATOR_ID`, `OPERATOR_KEY`, and (optionally) `HEDERA_NETWORK`.
2. Install dependencies:
   ```shell
   npm install
   ```
3. For distributed testing, install Docker and Docker Compose.
