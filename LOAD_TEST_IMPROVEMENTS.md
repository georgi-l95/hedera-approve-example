# Load Testing Framework Improvements

## Overview

The enhanced load testing framework (`scripts/loadTestEnhanced.js`) includes significant improvements over the original version, making it more robust, feature-rich, and production-ready for comprehensive Hedera network testing.

## Key Improvements Implemented

### 1. Multiple Transaction Types

The framework now supports diverse transaction types to better simulate real-world network usage:

- **HBAR_TRANSFER**: Basic HBAR transfers between accounts
- **TOKEN_TRANSFER**: Fungible token transfers (HTS tokens)
- **NFT_TRANSFER**: Non-fungible token transfers
- **TOKEN_APPROVAL**: Token allowance approvals

Each operation type can be weighted to control its relative frequency in the load test.

### 2. Advanced Latency Metrics

Replaced simple min/max/avg with percentile-based latency tracking:

- **P50 (Median)**: 50th percentile latency
- **P95**: 95th percentile latency
- **P99**: 99th percentile latency
- Provides better insight into real user experience
- Tracks up to 10,000 samples per stage for accurate percentiles

### 3. Metrics Export Capabilities

Results are now automatically exported in multiple formats:

- **JSON Export**: Complete metrics with all details for programmatic analysis
- **CSV Export**: Summary data for easy import into Excel, Grafana, or other visualization tools
- Timestamped filenames prevent overwriting previous results

### 4. Robust Error Handling

#### Retry Logic
- Configurable retry attempts with exponential backoff
- Customizable list of retriable error statuses
- Prevents transient failures from skewing results

#### Configuration Validation
- Pre-flight checks for configuration parameters
- Warns about potential issues (excessive TPS, insufficient funds)
- Prevents common configuration mistakes

### 5. Graceful Shutdown

- Handles Ctrl+C interruptions gracefully
- Waits for in-flight operations to complete (with timeout)
- Saves partial results when interrupted
- Prevents data loss during unexpected termination

### 6. Resource Pre-warming

Automatically prepares test resources before load testing:

- Creates fungible tokens and NFT collections
- Associates tokens with all test accounts
- Distributes tokens and NFTs across accounts
- Ensures accounts are ready for all transaction types

### 7. Enhanced Configuration Options

New configuration parameters for fine-tuned control:

```json
{
  "enableTokenOperations": true,
  "enableNFTOperations": true,
  "operationWeights": {
    "HBAR_TRANSFER": 10,
    "TOKEN_TRANSFER": 5,
    "NFT_TRANSFER": 2,
    "TOKEN_APPROVAL": 3
  },
  "retryConfig": {
    "maxRetries": 3,
    "backoffMs": 1000,
    "retriableStatuses": ["BUSY", "PLATFORM_NOT_ACTIVE"]
  }
}
```

### 8. Improved Progress Display

Enhanced real-time progress information:

- Shows success rate in final summary
- Per-operation type metrics with P95 latency
- More detailed error categorization
- Better formatted output for readability

## Usage

### Basic Usage (with default configuration)

```bash
npm run load-test-enhanced
```

### With Custom Configuration

```bash
npm run load-test-enhanced -- scripts/config/scenario.enhanced.json
```

### Configuration Examples

#### Minimal HBAR-only Test
```json
{
  "accountPoolSize": 5,
  "accountInitialBalanceHbar": 10,
  "enableTokenOperations": false,
  "enableNFTOperations": false,
  "stages": [
    { "tps": 10, "durationSeconds": 60 }
  ]
}
```

#### Full Feature Test
```json
{
  "accountPoolSize": 20,
  "accountInitialBalanceHbar": 50,
  "enableTokenOperations": true,
  "enableNFTOperations": true,
  "operationWeights": {
    "HBAR_TRANSFER": 10,
    "TOKEN_TRANSFER": 5,
    "NFT_TRANSFER": 2,
    "TOKEN_APPROVAL": 3
  },
  "stages": [
    { "tps": 5, "durationSeconds": 60 },
    { "tps": 25, "durationSeconds": 120 },
    { "tps": 100, "durationSeconds": 120 }
  ]
}
```

## Output Files

After completion, the framework generates:

1. **JSON Results** (`loadtest-results-TIMESTAMP.json`)
   - Complete metrics for all stages
   - Detailed latency percentiles
   - Per-operation type breakdowns
   - Error categorization

2. **CSV Summary** (`loadtest-results-TIMESTAMP.csv`)
   - Tabular format for spreadsheet analysis
   - Key metrics per stage
   - Easy to import into visualization tools

3. **Partial Results** (on interruption)
   - Saved as `loadtest-partial-TIMESTAMP.json`
   - Contains metrics up to the point of interruption

## Performance Considerations

### Network Limits
- Be aware of Hedera network TPS limits
- Start with lower TPS and gradually increase
- Monitor error rates to identify bottlenecks

### Account Funding
- Ensure sufficient HBAR balance for the test duration
- Each transaction costs approximately 0.001 HBAR
- Token operations may cost slightly more

### Resource Usage
- Higher TPS requires more memory for tracking
- Very long tests may accumulate large metric samples
- Consider breaking very long tests into multiple runs

## Monitoring During Tests

The live progress display shows:

```
Stage 3/7 | 1200/6000 (20.0%) | succ 1180 | fail 20 | in-flight 15 | rate 24.5 tx/s | eta 96s
```

- Current stage and total stages
- Progress percentage
- Success/failure counts
- In-flight operations (pending)
- Actual throughput rate
- Estimated time to completion

## Troubleshooting

### Common Issues

1. **"Insufficient account balance"**
   - Increase `accountInitialBalanceHbar`
   - Reduce test duration or TPS
   - Check transfer amount ranges

2. **"Token not found" errors**
   - Ensure `enableTokenOperations` is true
   - Check that pre-warming completed successfully
   - Verify network connectivity

3. **High failure rate**
   - Reduce TPS to sustainable levels
   - Check network status
   - Review retry configuration
   - Examine error categorization in results

4. **Out of memory**
   - Reduce stage durations
   - Lower the latency sample limit
   - Run stages sequentially rather than all at once

## Future Enhancements

Potential additions for even more comprehensive testing:

1. **Distributed Load Testing**
   - Coordinate multiple instances
   - Aggregate results from multiple nodes
   - Support for geographic distribution

2. **Smart Contract Interactions**
   - Contract deployment operations
   - Contract function calls
   - State modification transactions

3. **Advanced Scheduling**
   - Burst patterns
   - Sine wave load patterns
   - Random walk TPS variations

4. **Real-time Monitoring Integration**
   - Prometheus metrics export
   - Grafana dashboard templates
   - CloudWatch integration

5. **Automated Analysis**
   - Performance regression detection
   - Anomaly identification
   - Automatic report generation

## Package.json Update

Add the following script to your `package.json`:

```json
"scripts": {
  "load-test": "node scripts/loadTest.js",
  "load-test-enhanced": "node scripts/loadTestEnhanced.js"
}
```

## Summary

The enhanced load testing framework provides a production-ready solution for testing Hedera network performance with:

- **Realistic load patterns** through diverse transaction types
- **Accurate performance metrics** with percentile-based latency tracking
- **Robust error handling** with retries and validation
- **Comprehensive reporting** with multiple export formats
- **Better operational experience** with graceful shutdown and progress tracking

This makes it suitable for performance testing, capacity planning, and network validation in both development and production environments.