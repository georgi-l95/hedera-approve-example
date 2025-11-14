#!/bin/bash

# Hedera Distributed Load Testing - Quick Start Script

echo "🚀 Hedera Distributed Load Testing System"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating from template..."
    cp .env.example .env
    echo "   Please edit .env file with your Hedera credentials:"
    echo "   - OPERATOR_ID=0.0.YOUR_ACCOUNT_ID"
    echo "   - OPERATOR_KEY=YOUR_PRIVATE_KEY"
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Function to show menu
show_menu() {
    echo ""
    echo "What would you like to do?"
    echo ""
    echo "1) Start Distributed System (Docker)"
    echo "2) Start Local Coordinator Only"
    echo "3) Start Local Worker Only"
    echo "4) Run Quick Test (35 seconds)"
    echo "5) Run Enhanced Test (local)"
    echo "6) View System Logs"
    echo "7) Stop All Services"
    echo "8) Open Dashboard (http://localhost:3000)"
    echo "9) Exit"
    echo ""
    read -p "Select option [1-9]: " choice
}

# Main loop
while true; do
    show_menu

    case $choice in
        1)
            echo "🐳 Starting distributed system with Docker..."
            docker-compose up -d
            echo "✅ System started!"
            echo "📊 Dashboard available at: http://localhost:3000"
            echo "📈 Prometheus metrics at: http://localhost:9090"
            echo "📉 Grafana at: http://localhost:3001 (admin/admin)"
            ;;
        2)
            echo "🎛️ Starting coordinator..."
            npm run coordinator
            ;;
        3)
            read -p "Enter Worker ID (e.g., worker-1): " worker_id
            read -p "Enter Worker Port (default 3001): " worker_port
            worker_port=${worker_port:-3001}

            export WORKER_ID=$worker_id
            export WORKER_PORT=$worker_port
            export COORDINATOR_URL=http://localhost:3000

            echo "👷 Starting worker $worker_id on port $worker_port..."
            npm run worker
            ;;
        4)
            echo "⚡ Running quick test (35 seconds)..."
            npm run load-test-enhanced -- scripts/config/scenario.quick-test.json
            ;;
        5)
            echo "🚀 Running enhanced test..."
            npm run load-test-enhanced
            ;;
        6)
            echo "📜 Showing system logs (Ctrl+C to exit)..."
            docker-compose logs -f
            ;;
        7)
            echo "🛑 Stopping all services..."
            docker-compose down
            echo "✅ All services stopped"
            ;;
        8)
            echo "🌐 Opening dashboard..."
            if command -v open &> /dev/null; then
                open http://localhost:3000
            elif command -v xdg-open &> /dev/null; then
                xdg-open http://localhost:3000
            else
                echo "Please open http://localhost:3000 in your browser"
            fi
            ;;
        9)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid option. Please select 1-9."
            ;;
    esac
done