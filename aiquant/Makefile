# Makefile for aiquant project

.PHONY: help install dev test lint format clean

help:
	@echo "Available targets:"
	@echo "  install    - Install dependencies"
	@echo "  dev      - Start development server"
	@echo "  test     - Run tests"
	@echo "  lint     - Run linters"
	@echo "  format   - Format code"
	@echo "  clean    - Clean build artifacts"

install:
	@echo "Installing dependencies..."
	@pip install -e .

dev:
	@echo "Starting development server..."
	@python -m aiquant.main

test:
	@echo "Running tests..."
	@pytest tests/

lint:
	@echo "Running linters..."
	@ruff check src/ tests/

format:
	@echo "Formatting code..."
	@ruff format src/ tests/

clean:
	@echo "Cleaning build artifacts..."
	@find . -type d -name "__pycache__" -exec rm -rf {} +
	@find . -type f -name "*.py[co]" -delete
	@rm -rf build/ dist/ *.egg-info/
