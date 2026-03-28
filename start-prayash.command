#!/bin/bash
# Move to the directory where this script is located
cd "$(dirname "$0")"

# Export the user ID so the app knows who is logging in (if needed)
export USER_ID=prayash

echo "Starting Time Tracker for Prayash..."

# Only install dependencies if they haven't been installed yet
if [ ! -d "node_modules" ]; then
    echo "First time setup: Installing dependencies (this may take a minute)..."
    npm install
fi

echo "Starting the app..."
npm start
