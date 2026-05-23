# AIQuant - AI-powered Quantitative Stock Analysis System

AIQuant is a modern Python-based quantitative stock analysis system that combines traditional financial analysis with AI capabilities for smarter investment decisions.

## Features

- **Data Collection**: Real-time stock data collection from AKShare and other sources
- **Technical Analysis**: Comprehensive technical indicators (PE, ROE, RSI, Moving Averages)
- **Backtesting Engine**: Robust backtesting framework for strategy validation
- **AI Analysis**: Integration with LLMs (DeepSeek, etc.) for market sentiment analysis
- **Watchlist Management**: Smart ROE/PE screening and stock selection
- **REST API**: FastAPI endpoints for integration with frontend applications

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aiquant.git

cd aiquant

# Install dependencies
pip install -e .

# Install development dependencies
pip install -e ".[dev]"
```

## Quick Start

```bash
# Run the development server
make dev

# Run tests
make test

# Run linters
make lint
```

## Project Structure

```
aiquant/
├── src/          # Source code
│   └── aiquant/  # Main package
│       ├── collector/ # Data collection
│       ├── analyzer/  # Analysis and backtesting
│       ├── ai/        # AI analysis
│       ├── core/      # Core utilities and config
│       ├── db/        # Database layer
│       └── api/       # REST API
├── tests/        # Test suite
├── configs/      # Configuration files
├── data/         # Local data storage
├── logs/         # Log files
├── scripts/      # Utility scripts
├── pyproject.toml # Project configuration
└── Makefile      # Development commands
```

## License

MIT License
