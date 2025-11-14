# Distributed Load Testing Guide

## Overview

The distributed load testing system allows you to run high-scale performance tests against Hedera networks using multiple worker nodes coordinated by a central controller. This enables testing at much higher transaction rates than possible with a single machine.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Dashboard │────▶│   Coordinator   │◀────│     Worker 1    │
│   (Real-time)   │     │   (Orchestrator)│     │   (Executor)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │   │                      │
                               │   └──────────────────────┤
                               │                          │
                        ┌──────▼──────┐          ┌───────▼─────┐
                        │ Prometheus  │          │   Worker N  │
                        │  (Metrics)  │          │  (Executor) │
                        └─────────────┘          └─────────────┘
```

### Components

1. **Coordinator** - Central orchestrator that:
   - Manages worker registration and health
   - Distributes test configurations
   - Aggregates metrics from all workers
   - Provides web dashboard and API
   - Streams metrics to monitoring systems

2. **Workers** - Distributed executors that:
   - Execute actual load tests
   - Create account pools
   - Submit transactions to Hedera
   - Report metrics back to coordinator

3. **Dashboard** - Real-time web interface for:
   - Starting/stopping tests
   - Monitoring live metrics
   - Viewing worker status
   - Analyzing performance graphs

4. **Metrics Systems** - Optional monitoring:
   - Prometheus for time-series metrics
   - StatsD for aggregation
   - Grafana for visualization

## Quick Start with Docker

### 1. Prerequisites

```bash
# Install Docker and Docker Compose
docker --version
docker-compose --version

# Install npm dependencies
npm install
```

### 2. Configure Environment

Create `.env` file with your Hedera credentials:

```bash
OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
OPERATOR_KEY=YOUR_PRIVATE_KEY_HEX
HEDERA_NETWORK=testnet
```

### 3. Start the System

```bash
# Start all services (coordinator, 2 workers, monitoring)
docker-compose up -d

# View logs
docker-compose logs -f

# Scale workers dynamically
docker-compose up -d --scale worker=5
```

### 4. Access Dashboard

Open http://localhost:3000 in your browser.

### 5. Run a Test

1. Wait for workers to register (shown in dashboard)
2. Configure test parameters:
   - Workers: 2
   - Target TPS: 100
   - Duration: 60 seconds
3. Click "Start Test"
4. Monitor real-time metrics

### 6. Stop Services

```bash
docker-compose down
```

## Manual Setup (Without Docker)

### 1. Start Coordinator

```bash
# Terminal 1
export COORDINATOR_PORT=3000
export PROMETHEUS_ENABLED=true
export STATSD_ENABLED=true
node scripts/distributed/coordinator.js
```

### 2. Start Workers

```bash
# Terminal 2 (Worker 1)
export WORKER_ID=worker-1
export WORKER_PORT=3001
export COORDINATOR_URL=http://localhost:3000
node scripts/distributed/worker.js

# Terminal 3 (Worker 2)
export WORKER_ID=worker-2
export WORKER_PORT=3002
export COORDINATOR_URL=http://localhost:3000
node scripts/distributed/worker.js
```

### 3. Access Dashboard

Open http://localhost:3000

## Configuration Options

### Coordinator Configuration

```javascript
// Environment variables
COORDINATOR_PORT=3000          // API and dashboard port
PROMETHEUS_ENABLED=true        // Enable Prometheus metrics
PROMETHEUS_PORT=9090          // Prometheus metrics port
STATSD_ENABLED=true          // Enable StatsD metrics
STATSD_HOST=localhost        // StatsD host
STATSD_PORT=8125            // StatsD port
```

### Worker Configuration

```javascript
// Environment variables
WORKER_ID=worker-1           // Unique worker identifier
WORKER_PORT=3001             // Worker API port
COORDINATOR_URL=http://...   // Coordinator URL
OPERATOR_ID=0.0.123          // Hedera account ID
OPERATOR_KEY=...             // Hedera private key
```

### Test Configuration

```json
{
  "accountPoolSize": 20,
  "accountInitialBalanceHbar": 25,
  "transferAmountHbarRange": [0.0001, 0.01],
  "enableTokenOperations": true,
  "enableNFTOperations": false,
  "operationWeights": {
    "HBAR_TRANSFER": 10,
    "TOKEN_TRANSFER": 5,
    "NFT_TRANSFER": 2,
    "TOKEN_APPROVAL": 3
  },
  "stages": [
    { "tps": 50, "durationSeconds": 60 },
    { "tps": 100, "durationSeconds": 120 },
    { "tps": 200, "durationSeconds": 60 }
  ]
}
```

## Distributed Testing on Multiple Machines

### Setup Coordinator (Machine 1)

```bash
# On coordinator machine
export COORDINATOR_PORT=3000
node scripts/distributed/coordinator.js

# Note the coordinator's IP address
ip addr show  # e.g., 192.168.1.100
```

### Setup Workers (Other Machines)

```bash
# On each worker machine
export WORKER_ID=worker-$(hostname)
export COORDINATOR_URL=http://192.168.1.100:3000
export WORKER_PORT=3001
node scripts/distributed/worker.js
```

### Network Requirements

- Coordinator port 3000 must be accessible from all workers
- Workers need outbound access to Hedera network
- Dashboard port 3000 must be accessible from browsers

## Monitoring and Metrics

### Prometheus Metrics

Access Prometheus metrics at http://localhost:9090/metrics

Key metrics:
- `hedera_loadtest_transactions_total` - Total transactions
- `hedera_loadtest_transactions_success` - Successful transactions
- `hedera_loadtest_transactions_failed` - Failed transactions
- `hedera_loadtest_latency_ms` - Transaction latency histogram
- `hedera_loadtest_current_tps` - Current transactions per second
- `hedera_loadtest_active_workers` - Number of active workers

### Grafana Dashboards

1. Access Grafana at http://localhost:3001
2. Login with admin/admin
3. Import dashboard from `docker/grafana/dashboards/`

### StatsD Metrics

StatsD metrics are sent to localhost:8125 by default.

Metric patterns:
- `hedera.loadtest.transactions.submitted.{worker}`
- `hedera.loadtest.transactions.success.{worker}`
- `hedera.loadtest.latency.{worker}`
- `hedera.loadtest.tps.{worker}`

## Dashboard Features

### Real-time Metrics

- **Total Transactions** - Cumulative count across all workers
- **Success Rate** - Percentage of successful transactions
- **Current TPS** - Real-time throughput
- **Average Latency** - Mean transaction latency
- **P95 Latency** - 95th percentile latency
- **Active Workers** - Number of workers currently running

### Live Charts

1. **Throughput (TPS)** - Actual vs Target TPS over time
2. **Latency** - P50, P95, P99 latency trends
3. **Success/Failure Rate** - Success percentage and failure counts
4. **Error Distribution** - Top error types and frequencies

### Worker Management

- View worker status (idle/running/offline)
- Monitor worker health
- See worker host information

### Test Control

- Start tests with custom parameters
- Stop running tests
- Configure advanced settings (right-click Start button)

## Load Patterns and Scenarios

### 1. Gradual Ramp-up

```json
{
  "stages": [
    { "tps": 10, "durationSeconds": 60 },
    { "tps": 50, "durationSeconds": 120 },
    { "tps": 100, "durationSeconds": 120 },
    { "tps": 200, "durationSeconds": 120 },
    { "tps": 100, "durationSeconds": 60 }
  ]
}
```

### 2. Stress Test

```json
{
  "stages": [
    { "tps": 500, "durationSeconds": 300 }
  ]
}
```

### 3. Mixed Operations

```json
{
  "enableTokenOperations": true,
  "enableNFTOperations": true,
  "operationWeights": {
    "HBAR_TRANSFER": 50,
    "TOKEN_TRANSFER": 30,
    "NFT_TRANSFER": 10,
    "TOKEN_APPROVAL": 10
  }
}
```

### 4. Endurance Test

```json
{
  "stages": [
    { "tps": 50, "durationSeconds": 3600 }
  ]
}
```

## Scaling Guidelines

### Worker Scaling

| Target TPS | Recommended Workers | Notes |
|------------|-------------------|-------|
| < 100      | 1                 | Single worker sufficient |
| 100-500    | 2-3               | Distribute load |
| 500-1000   | 4-5               | Multiple machines recommended |
| 1000+      | 5-10              | Requires careful planning |

### Resource Requirements

**Per Worker:**
- CPU: 2 cores minimum
- RAM: 2GB minimum
- Network: 10 Mbps minimum
- HBAR: (TPS × Duration × 0.001) + Account pool funding

**Coordinator:**
- CPU: 2 cores
- RAM: 1GB
- Disk: 1GB for results

### Performance Tuning

1. **Account Pool Size**
   - Larger pools reduce contention
   - Minimum: 2 × expected TPS
   - Recommended: 5 × expected TPS

2. **Network Optimization**
   - Use geographically close workers
   - Ensure low latency to Hedera nodes
   - Monitor network bandwidth

3. **Worker Distribution**
   - Evenly distribute TPS across workers
   - Account for worker capacity differences
   - Monitor individual worker metrics

## Troubleshooting

### Workers Not Registering

```bash
# Check coordinator is running
curl http://localhost:3000/api/test/status

# Check worker can reach coordinator
curl http://coordinator-ip:3000/api/test/status

# Check logs
docker-compose logs worker1
```

### High Failure Rate

1. Check account balances
2. Reduce TPS target
3. Increase retry configuration
4. Check Hedera network status

### Dashboard Not Loading

```bash
# Check coordinator is running
docker-compose ps coordinator

# Check port 3000 is accessible
netstat -an | grep 3000

# View coordinator logs
docker-compose logs coordinator
```

### Memory Issues

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or in Docker Compose
environment:
  - NODE_OPTIONS=--max-old-space-size=4096
```

## Production Best Practices

### 1. Pre-Test Checklist

- [ ] Verify all workers are online
- [ ] Check account funding is sufficient
- [ ] Confirm network connectivity
- [ ] Review test configuration
- [ ] Set up monitoring/alerting
- [ ] Prepare result storage

### 2. During Test

- Monitor dashboard continuously
- Watch for error rate changes
- Check worker health status
- Monitor system resources
- Save periodic snapshots

### 3. Post-Test

- Export metrics to JSON/CSV
- Analyze error patterns
- Review latency percentiles
- Document findings
- Clean up resources

### 4. Security

- Use encrypted connections (HTTPS/WSS)
- Secure private keys properly
- Limit coordinator access
- Use firewall rules for workers
- Rotate credentials regularly

## API Reference

### Coordinator API

#### Start Test
```http
POST /api/test/start
Content-Type: application/json

{
  "config": { /* test configuration */ },
  "workerCount": 3
}
```

#### Stop Test
```http
POST /api/test/stop
```

#### Get Status
```http
GET /api/test/status
```

#### Get Metrics
```http
GET /api/metrics
```

### Worker API

#### Start Test
```http
POST /api/start
Content-Type: application/json

{
  "config": { /* test configuration */ },
  "testId": "test-123"
}
```

#### Get Status
```http
GET /api/status
```

## Results and Analysis

### Output Files

Results are saved automatically:
- `distributed-test-TIMESTAMP.json` - Complete test results
- Includes configuration, metrics, and report

### Key Metrics to Analyze

1. **Throughput**
   - Actual vs Target TPS
   - Throughput stability
   - Peak sustained TPS

2. **Latency**
   - P50 (median) - typical performance
   - P95 - most users experience
   - P99 - worst case scenarios

3. **Success Rate**
   - Overall success percentage
   - Error distribution
   - Failure patterns

4. **Resource Usage**
   - HBAR consumption
   - Account utilization
   - Worker load distribution

## Advanced Topics

### Custom Operations

Add new transaction types in `worker.js`:

```javascript
operations.push({
    type: "SMART_CONTRACT_CALL",
    weight: 5,
    handler: () => this.executeContractCall(context)
});
```

### Custom Metrics

Stream additional metrics:

```javascript
this.metricsStreamer.streamToPrometheus({
    customMetric: value,
    labels: { worker: this.workerId }
});
```

### Webhook Integration

Send test results to external systems:

```javascript
// In coordinator.js
async function sendWebhook(results) {
    await fetch('https://your-webhook.com', {
        method: 'POST',
        body: JSON.stringify(results)
    });
}
```

## Support and Contributing

For issues or questions:
1. Check the troubleshooting section
2. Review error logs
3. Open an issue on GitHub

To contribute:
1. Fork the repository
2. Create a feature branch
3. Implement improvements
4. Submit a pull request