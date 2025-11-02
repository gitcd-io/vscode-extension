#!/bin/bash
# Setup script for Git-CD VSCode Extension
# This creates a Python virtual environment and installs gitcd

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/python-env"

echo "Setting up Git-CD Python environment..."

# Check if Python3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found. Please install Python 3."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
else
    echo "Virtual environment already exists."
fi

# Activate virtual environment and install gitcd
echo "Installing gitcd..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install gitcd

# Verify installation
if "$VENV_DIR/bin/python" -c "from gitcd.bin.console import main" 2>/dev/null; then
    echo "✓ Git-CD successfully installed!"
    "$VENV_DIR/bin/git-cd" version || true
else
    echo "✗ Git-CD installation failed"
    exit 1
fi

echo "Setup complete!"
