#!/bin/bash

# Exit on error
set -e

echo "Installing dependencies..."
npm ci

echo "Building the application..."
npm run build

echo "Build completed successfully!" 