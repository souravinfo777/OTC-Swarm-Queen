#!/bin/bash
# Starts the Python FastAPI + WebSocket backend on ws://127.0.0.1:8765/ws
echo "Starting OTC Swarm Queen Python Backend..."
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765 --reload
