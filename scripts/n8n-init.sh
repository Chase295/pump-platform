#!/bin/sh
# n8n Entrypoint Wrapper
# Starts n8n, then auto-creates owner account on fresh deploys.
# On subsequent starts, setup call is a harmless no-op.

# Start n8n in background
n8n start &
N8N_PID=$!

# Wait for n8n API to be fully ready (not just healthz - that fires before migrations finish)
attempt=0
max_attempts=90
while [ $attempt -lt $max_attempts ]; do
  if wget -qO- http://localhost:5678/rest/settings 2>/dev/null | grep -q '"settingsMode"'; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ $attempt -lt $max_attempts ]; then
  # Use node for reliable HTTP POST (wget mangles JSON body)
  node -e "
    const http = require('http');
    const data = JSON.stringify({
      email: process.env.N8N_ADMIN_EMAIL || 'admin@pump.local',
      password: process.env.N8N_ADMIN_PASSWORD || 'PumpAdmin123!',
      firstName: 'Pump',
      lastName: 'Admin'
    });
    const req = http.request({
      hostname: 'localhost', port: 5678,
      path: '/rest/owner/setup', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200)
          console.log('[n8n-init] Owner ready (' + (process.env.N8N_ADMIN_EMAIL || 'admin@pump.local') + ')');
        else
          console.log('[n8n-init] Owner already configured');
      });
    });
    req.on('error', e => console.log('[n8n-init] Skipped: ' + e.message));
    req.write(data);
    req.end();
  "
fi

# Wait for n8n process (keeps container running)
wait $N8N_PID
