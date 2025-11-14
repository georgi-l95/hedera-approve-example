// StatsD Configuration for Hedera Load Testing
{
  port: 8125,
  mgmt_port: 8126,

  // Flush metrics every 10 seconds
  flushInterval: 10000,

  // Percentile thresholds for timing metrics
  percentThreshold: [50, 95, 99],

  // Graphite backend configuration (optional)
  // graphitePort: 2003,
  // graphiteHost: "graphite.example.com",

  // Backend modules to load
  backends: ["./backends/console"],

  // Enable debug mode
  debug: false,

  // Prefix for all metrics
  prefixStats: "hedera.loadtest",

  // Delete idle stats
  deleteIdleStats: true,

  // Delete counters after flush
  deleteCounters: false,

  // Delete gauges after flush
  deleteGauges: false,

  // Delete sets after flush
  deleteSets: false,

  // Delete timers after flush
  deleteTimers: false,

  // Histogram configuration
  histogram: {
    // Calculate histogram for timers
    calculateHistogram: true,

    // Bins for histogram
    bins: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
  }
}