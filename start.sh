#!/bin/bash
# TrishulHub AI Agent Dashboard - Start Script
# Run this to start the production server with proper configuration

cd /home/z/my-project

# Ensure database permissions
chmod 666 db/custom.db 2>/dev/null
chmod 777 db/ 2>/dev/null

# Kill any existing server
pkill -f "next start" 2>/dev/null
sleep 1
fuser -k 3000/tcp 2>/dev/null
sleep 1

# Start the server with increased memory limit
# Node.js default heap is ~1.5GB which is too small for this app
NODE_OPTIONS='--max-old-space-size=4096' nohup node node_modules/.bin/next start -p 3000 >> /tmp/trishulhub.log 2>&1 &
disown

echo "Waiting for server to start..."
for i in $(seq 1 10); do
  sleep 2
  if curl -s -o /dev/null http://localhost:3000/login 2>/dev/null; then
    echo "✅ TrishulHub server is running on port 3000"
    echo "   Access via: http://localhost:3000"
    echo "   Log file: /tmp/trishulhub.log"
    exit 0
  fi
done

echo "❌ Server failed to start. Check /tmp/trishulhub.log for errors"
exit 1
