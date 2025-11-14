/**
 * Hedera Load Test Dashboard JavaScript
 * Real-time metrics visualization and test control
 */

class Dashboard {
    constructor() {
        this.ws = null;
        this.charts = {};
        this.metrics = {
            history: [],
            maxHistoryLength: 60
        };
        this.currentTest = null;
        this.workers = new Map();

        this.initializeElements();
        this.initializeCharts();
        this.initializeWebSocket();
        this.setupEventListeners();
    }

    initializeElements() {
        // Connection status
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionText = document.getElementById('connectionText');

        // Controls
        this.startBtn = document.getElementById('startTest');
        this.stopBtn = document.getElementById('stopTest');
        this.workerCountInput = document.getElementById('workerCount');
        this.targetTpsInput = document.getElementById('targetTps');
        this.durationInput = document.getElementById('duration');

        // Status
        this.testStatusText = document.getElementById('testStatusText');

        // Metrics
        this.totalTransactions = document.getElementById('totalTransactions');
        this.successRate = document.getElementById('successRate');
        this.currentTps = document.getElementById('currentTps');
        this.avgLatency = document.getElementById('avgLatency');
        this.p95Latency = document.getElementById('p95Latency');
        this.activeWorkers = document.getElementById('activeWorkers');

        // Workers
        this.workersList = document.getElementById('workersList');

        // Logs
        this.activityLog = document.getElementById('activityLog');

        // Modal
        this.configModal = document.getElementById('configModal');
    }

    initializeCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#b0b0b0'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#b0b0b0' },
                    grid: { color: '#3e3e42' }
                },
                y: {
                    ticks: { color: '#b0b0b0' },
                    grid: { color: '#3e3e42' }
                }
            }
        };

        // TPS Chart
        this.charts.tps = new Chart(document.getElementById('tpsChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Actual TPS',
                    data: [],
                    borderColor: '#0078d4',
                    backgroundColor: 'rgba(0, 120, 212, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Target TPS',
                    data: [],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderDash: [5, 5],
                    tension: 0.4
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });

        // Latency Chart
        this.charts.latency = new Chart(document.getElementById('latencyChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'P50',
                    data: [],
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                }, {
                    label: 'P95',
                    data: [],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4
                }, {
                    label: 'P99',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });

        // Success/Failure Chart
        this.charts.success = new Chart(document.getElementById('successChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Success Rate (%)',
                    data: [],
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y'
                }, {
                    label: 'Failures',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    x: chartOptions.scales.x,
                    y: {
                        ...chartOptions.scales.y,
                        beginAtZero: true,
                        max: 100,
                        position: 'left'
                    },
                    y1: {
                        ...chartOptions.scales.y,
                        beginAtZero: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });

        // Error Distribution Chart
        this.charts.errors = new Chart(document.getElementById('errorChart'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Error Count',
                    data: [],
                    backgroundColor: [
                        'rgba(220, 53, 69, 0.7)',
                        'rgba(255, 193, 7, 0.7)',
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(255, 159, 64, 0.7)',
                        'rgba(255, 205, 86, 0.7)'
                    ]
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.setConnectionStatus(true);
            this.addLog('Connected to coordinator', 'success');
        };

        this.ws.onclose = () => {
            this.setConnectionStatus(false);
            this.addLog('Disconnected from coordinator', 'error');

            // Attempt reconnection after 3 seconds
            setTimeout(() => this.initializeWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            this.addLog('WebSocket error', 'error');
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        };
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startTest());
        this.stopBtn.addEventListener('click', () => this.stopTest());

        // Advanced config button (right-click on start button)
        this.startBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showConfigModal();
        });

        // Modal controls
        document.getElementById('applyConfig').addEventListener('click', () => {
            this.applyAdvancedConfig();
        });

        document.getElementById('cancelConfig').addEventListener('click', () => {
            this.hideConfigModal();
        });
    }

    handleMessage(data) {
        switch (data.type) {
            case 'workerUpdate':
                this.updateWorkers(data.workers);
                break;
            case 'metricsUpdate':
                this.updateMetrics(data.metrics);
                break;
            case 'testUpdate':
                this.updateTestStatus(data.test);
                break;
            case 'testStarted':
                this.onTestStarted(data.testId);
                break;
            case 'testStopped':
                this.onTestStopped();
                break;
            case 'error':
                this.addLog(data.error, 'error');
                break;
        }
    }

    updateWorkers(workers) {
        this.workersList.innerHTML = '';

        if (!workers || workers.length === 0) {
            this.workersList.innerHTML = '<div class="no-workers">No workers connected</div>';
            this.activeWorkers.textContent = '0';
            return;
        }

        let activeCount = 0;
        workers.forEach(worker => {
            const card = document.createElement('div');
            card.className = `worker-card ${worker.online ? (worker.status === 'running' ? 'active' : '') : 'offline'}`;
            card.innerHTML = `
                <div class="worker-name">${worker.id}</div>
                <div class="worker-status">
                    ${worker.online ? `Status: ${worker.status}` : 'Offline'}
                </div>
                <div class="worker-host">${worker.host}</div>
            `;
            this.workersList.appendChild(card);

            if (worker.online && worker.status === 'running') {
                activeCount++;
            }
        });

        this.activeWorkers.textContent = activeCount.toString();
    }

    updateMetrics(metrics) {
        if (!metrics) return;

        // Update metric cards
        this.totalTransactions.textContent = this.formatNumber(metrics.submitted || 0);

        const successRateValue = metrics.submitted > 0
            ? ((metrics.success / metrics.submitted) * 100).toFixed(1)
            : '0';
        this.successRate.textContent = `${successRateValue}%`;

        // Calculate current TPS (based on recent data)
        const currentTpsValue = this.calculateCurrentTps(metrics);
        this.currentTps.textContent = currentTpsValue.toFixed(1);

        // Update latency metrics
        if (metrics.latencyPercentiles) {
            this.avgLatency.textContent = (metrics.latencyPercentiles.avg || 0).toFixed(1);
            this.p95Latency.textContent = (metrics.latencyPercentiles.p95 || 0).toFixed(1);
        }

        // Add to history
        this.addMetricsToHistory(metrics);

        // Update charts
        this.updateCharts(metrics);
    }

    addMetricsToHistory(metrics) {
        const timestamp = new Date().toLocaleTimeString();

        this.metrics.history.push({
            timestamp,
            ...metrics
        });

        if (this.metrics.history.length > this.metrics.maxHistoryLength) {
            this.metrics.history.shift();
        }
    }

    calculateCurrentTps(metrics) {
        if (this.metrics.history.length < 2) return 0;

        const recent = this.metrics.history[this.metrics.history.length - 1];
        const previous = this.metrics.history[this.metrics.history.length - 2];

        const txDiff = (recent.submitted || 0) - (previous.submitted || 0);
        const timeDiff = 2; // Assuming 2 seconds between updates

        return txDiff / timeDiff;
    }

    updateCharts(metrics) {
        const labels = this.metrics.history.map(h => h.timestamp);
        const currentTps = this.calculateCurrentTps(metrics);

        // Update TPS chart
        this.charts.tps.data.labels = labels;
        this.charts.tps.data.datasets[0].data = this.metrics.history.map((h, i) => {
            if (i === 0) return 0;
            const prev = this.metrics.history[i - 1];
            return ((h.submitted || 0) - (prev.submitted || 0)) / 2;
        });
        this.charts.tps.data.datasets[1].data = this.metrics.history.map(() =>
            parseInt(this.targetTpsInput.value)
        );
        this.charts.tps.update('none');

        // Update Latency chart
        if (metrics.latencyPercentiles) {
            this.charts.latency.data.labels = labels;
            this.charts.latency.data.datasets[0].data = this.metrics.history.map(h =>
                h.latencyPercentiles?.p50 || 0
            );
            this.charts.latency.data.datasets[1].data = this.metrics.history.map(h =>
                h.latencyPercentiles?.p95 || 0
            );
            this.charts.latency.data.datasets[2].data = this.metrics.history.map(h =>
                h.latencyPercentiles?.p99 || 0
            );
            this.charts.latency.update('none');
        }

        // Update Success/Failure chart
        this.charts.success.data.labels = labels;
        this.charts.success.data.datasets[0].data = this.metrics.history.map(h => {
            return h.submitted > 0 ? (h.success / h.submitted * 100) : 0;
        });
        this.charts.success.data.datasets[1].data = this.metrics.history.map(h =>
            h.failures || 0
        );
        this.charts.success.update('none');

        // Update Error distribution chart
        if (metrics.errors) {
            const errorEntries = Object.entries(metrics.errors).slice(0, 5);
            this.charts.errors.data.labels = errorEntries.map(e => e[0]);
            this.charts.errors.data.datasets[0].data = errorEntries.map(e => e[1]);
            this.charts.errors.update('none');
        }
    }

    updateTestStatus(test) {
        this.currentTest = test;

        if (test && test.status === 'running') {
            this.testStatusText.textContent = `Running (ID: ${test.testId})`;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
        } else {
            this.testStatusText.textContent = 'Idle';
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
        }
    }

    startTest() {
        const config = this.buildConfig();

        this.ws.send(JSON.stringify({
            type: 'startTest',
            config,
            workerCount: parseInt(this.workerCountInput.value)
        }));

        this.addLog('Starting test...', 'success');
    }

    stopTest() {
        this.ws.send(JSON.stringify({
            type: 'stopTest'
        }));

        this.addLog('Stopping test...', 'warning');
    }

    buildConfig() {
        const tps = parseInt(this.targetTpsInput.value);
        const duration = parseInt(this.durationInput.value);

        return {
            accountPoolSize: 10,
            accountInitialBalanceHbar: 10,
            transferAmountHbarRange: [0.0001, 0.001],
            stages: [{
                tps: tps,
                durationSeconds: duration
            }]
        };
    }

    showConfigModal() {
        this.configModal.classList.add('show');
    }

    hideConfigModal() {
        this.configModal.classList.remove('show');
    }

    applyAdvancedConfig() {
        try {
            const stages = JSON.parse(document.getElementById('configStages').value);
            // Validate stages
            if (!Array.isArray(stages)) {
                throw new Error('Stages must be an array');
            }

            // Update UI with first stage values
            if (stages.length > 0) {
                this.targetTpsInput.value = stages[0].tps;
                this.durationInput.value = stages[0].durationSeconds;
            }

            this.hideConfigModal();
            this.addLog('Configuration updated', 'success');
        } catch (error) {
            alert('Invalid configuration: ' + error.message);
        }
    }

    onTestStarted(testId) {
        this.addLog(`Test ${testId} started`, 'success');
        this.clearMetricsHistory();
    }

    onTestStopped() {
        this.addLog('Test stopped', 'warning');
    }

    clearMetricsHistory() {
        this.metrics.history = [];

        // Clear all charts
        Object.values(this.charts).forEach(chart => {
            chart.data.labels = [];
            chart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            chart.update('none');
        });
    }

    setConnectionStatus(connected) {
        if (connected) {
            this.connectionStatus.classList.remove('offline');
            this.connectionStatus.classList.add('online');
            this.connectionText.textContent = 'Connected';
        } else {
            this.connectionStatus.classList.remove('online');
            this.connectionStatus.classList.add('offline');
            this.connectionText.textContent = 'Disconnected';
        }
    }

    addLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;

        this.activityLog.insertBefore(entry, this.activityLog.firstChild);

        // Keep only last 50 entries
        while (this.activityLog.children.length > 50) {
            this.activityLog.removeChild(this.activityLog.lastChild);
        }
    }

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});