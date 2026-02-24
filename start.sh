#!/bin/bash
# Mnemo Launcher - Data Lake Edition

DATA_LAKE="$HOME/.openclaw/data-lake"
PID_FILE="/tmp/mnemo.pid"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "Mnemo already running (PID: $(cat $PID_FILE))"
      exit 0
    fi
    
    echo "Starting Mnemo Data Lake..."
    echo "  Data Lake: $DATA_LAKE"
    
    mkdir -p "$DATA_LAKE"
    chmod 700 "$DATA_LAKE"
    
    cd "$(dirname "$0")"
    nohup node server.js > /tmp/mnemo.log 2>&1 &
    echo $! > "$PID_FILE"
    
    sleep 2
    if curl -s http://localhost:10000/api/health > /dev/null; then
      echo "✅ Mnemo running on http://localhost:10000"
      curl -s http://localhost:10000/api/health | grep -o '"projects":\[[^]]*\]'
    else
      echo "❌ Failed to start. Check /tmp/mnemo.log"
      exit 1
    fi
    ;;
    
  stop)
    if [ -f "$PID_FILE" ]; then
      kill $(cat "$PID_FILE") 2>/dev/null
      rm -f "$PID_FILE"
      echo "Mnemo stopped"
    else
      echo "Mnemo not running"
    fi
    ;;
    
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "✅ Mnemo running (PID: $(cat $PID_FILE))"
      curl -s http://localhost:10000/api/health | head -1
    else
      echo "❌ Mnemo not running"
    fi
    ;;
    
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac