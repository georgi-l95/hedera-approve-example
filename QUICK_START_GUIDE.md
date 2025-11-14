# Load Testing Framework - Quick Start Guide

## Getting Started with the Enhanced Load Test

### Prerequisites

1. Ensure your `.env` file is configured:
```bash
OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
OPERATOR_KEY=YOUR_PRIVATE_KEY
HEDERA_NETWORK=testnet  # or mainnet, or custom JSON
```

2. Install dependencies:
```bash
npm install
```

### Running Your First Load Test

#### Option 1: Quick Test (35 seconds)
Perfect for testing your setup:

```bash
npm run load-test-enhanced -- scripts/config/scenario.quick-test.json
```

This runs a brief test with:
- 5 test accounts
- Mix of HBAR and token transfers
- 3 stages (2, 5, and 10 TPS)
- Total duration: 35 seconds

#### Option 2: Default Test (12 minutes)
Standard load test with progressive ramp-up:

```bash
npm run load-test-enhanced
```

This uses default configuration:
- 10 test accounts
- HBAR transfers only
- 6 stages (10 to 500 TPS)
- Total duration: 12 minutes

#### Option 3: Full Feature Test
Test all transaction types:

```bash
npm run load-test-enhanced -- scripts/config/scenario.enhanced.json
```

Includes:
- 15 test accounts
- HBAR, token, and NFT operations
- Token approvals
- 7 stages with warm-up and cool-down

### Understanding the Output

#### Real-time Progress
During the test, you'll see:
```
Stage 2/7 | 240/1200 (20.0%) | succ 235 | fail 5 | in-flight 8 | rate 24.5 tx/s | eta 40s
```

#### Per-Stage Summary
After each stage:
```
Stage 2: submitted=1200, success=1190, failures=10
  Latency (ms): avg=245.32, p50=220.15, p95=420.67, p99=580.23, min=120.15, max=1205.67
  Throughput: target=10 TPS, actual=9.87 TPS over 121.2s
  Breakdown:
    HBAR_TRANSFER: submitted=800, success=795, failures=5, avgLatency=242.15ms, p95=415.23ms
    TOKEN_TRANSFER: submitted=400, success=395, failures=5, avgLatency=251.43ms, p95=425.67ms
```

#### Final Results
Results are automatically saved:
- `loadtest-results-TIMESTAMP.json` - Full metrics data
- `loadtest-results-TIMESTAMP.csv` - Spreadsheet-friendly summary

### Creating Custom Scenarios

Create your own test configuration:

```json
{
  "accountPoolSize": 10,
  "accountInitialBalanceHbar": 15,
  "enableTokenOperations": true,
  "enableNFTOperations": false,
  "operationWeights": {
    "HBAR_TRANSFER": 10,
    "TOKEN_TRANSFER": 5,
    "TOKEN_APPROVAL": 2
  },
  "stages": [
    { "tps": 10, "durationSeconds": 60 },
    { "tps": 25, "durationSeconds": 120 },
    { "tps": 50, "durationSeconds": 120 }
  ]
}
```

### Tips for Best Results

1. **Start Small**: Use the quick-test configuration first to validate your setup

2. **Monitor Resources**: Watch for account balance depletion during long tests

3. **Gradual Ramp-up**: Start with lower TPS and increase gradually

4. **Check Errors**: If you see high failure rates, reduce TPS or check network status

5. **Cost Estimation**: Each transaction costs ~0.001 HBAR. Calculate:
   ```
   Total Cost = (TPS × Duration × 0.001) + (Accounts × Initial Balance)
   ```

### Troubleshooting

#### "Environment variables OPERATOR_ID and OPERATOR_KEY are required"
- Check your `.env` file exists and contains valid credentials

#### High Failure Rate
- Reduce TPS in your configuration
- Check network status
- Ensure accounts have sufficient balance

#### "No token available for transfer"
- Set `enableTokenOperations: false` if you don't need token testing
- Or ensure the token creation succeeds during pre-warming

#### Interrupted Test
- Results are auto-saved as `loadtest-partial-TIMESTAMP.json`
- Use Ctrl+C to gracefully shutdown and save partial results

### Comparing Original vs Enhanced

Run both versions to see the improvements:

```bash
# Original version (basic metrics)
npm run load-test -- scripts/config/scenario.quick-test.json

# Enhanced version (full features)
npm run load-test-enhanced -- scripts/config/scenario.quick-test.json
```

Key differences you'll notice:
- Enhanced version shows percentile latencies (p50, p95, p99)
- Automatic export to JSON and CSV
- Support for multiple transaction types
- Graceful shutdown handling
- Retry logic for failed transactions

### Next Steps

1. **Customize Operations**: Modify `operationWeights` to match your use case

2. **Analyze Results**: Import CSV files into Excel or Google Sheets for visualization

3. **Set Baselines**: Save good results as baselines for regression testing

4. **Scale Testing**: Increase `accountPoolSize` and TPS for stress testing

5. **Monitor Costs**: Track HBAR consumption across test runs

### Advanced Features

#### Enabling All Transaction Types
```json
{
  "enableTokenOperations": true,
  "enableNFTOperations": true,
  "operationWeights": {
    "HBAR_TRANSFER": 10,
    "TOKEN_TRANSFER": 5,
    "NFT_TRANSFER": 3,
    "TOKEN_APPROVAL": 2
  }
}
```

#### Custom Retry Configuration
```json
{
  "retryConfig": {
    "maxRetries": 5,
    "backoffMs": 2000,
    "retriableStatuses": [
      "BUSY",
      "PLATFORM_NOT_ACTIVE",
      "THROTTLED_AT_CONSENSUS"
    ]
  }
}
```

#### Progressive Load Pattern
```json
{
  "stages": [
    { "tps": 5, "durationSeconds": 30 },   // Warm-up
    { "tps": 10, "durationSeconds": 60 },  // Baseline
    { "tps": 25, "durationSeconds": 60 },  // Moderate
    { "tps": 50, "durationSeconds": 60 },  // High
    { "tps": 100, "durationSeconds": 30 }, // Peak
    { "tps": 25, "durationSeconds": 30 }   // Cool-down
  ]
}
```

### Support

For issues or questions:
1. Check the error messages in the console
2. Review the `LOAD_TEST_IMPROVEMENTS.md` for detailed documentation
3. Examine exported JSON files for detailed error information
4. Open an issue on GitHub with your configuration and error logs