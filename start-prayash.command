#!/bin/bash
# Move to the directory where this script is located
cd "$(dirname "$0")"

# Export the user ID so the app knows who is logging in (if needed)
export USER_ID=prayash

echo "Starting Time Tracker for Prayash..."
echo "Installing dependencies (this may take a minute on the first run)..."
npm install

echo "Starting the app..."
npm start
