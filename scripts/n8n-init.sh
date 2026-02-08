#!/bin/sh
# n8n Entrypoint Wrapper
# Starts n8n, then auto-creates owner account on fresh deploys.
# On subsequent starts, detects existing owner and skips.

# Start n8n in background
n8n start &
N8N_PID=$!

# Wait for n8n API to be fully ready (not just healthz - that fires before migrations finish)
echo "[n8n-init] Waiting for n8n API..."
attempt=0
max_attempts=90
while [ $attempt -lt $max_attempts ]; do
  if wget -qO- http://localhost:5678/rest/settings 2>/dev/null | grep -q '"settingsMode"'; then
    echo "[n8n-init] API ready (attempt $((attempt + 1)))"
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ $attempt -eq $max_attempts ]; then
  echo "[n8n-init] ERROR: API not ready after ${max_attempts} attempts"
else
  # Use node to check settings and create owner if needed
  node -e "
    const http = require('http');

    function get(path) {
      return new Promise((resolve, reject) => {
        http.get({ hostname: 'localhost', port: 5678, path }, res => {
          let b = ''; res.on('data', c => b += c);
          res.on('end', () => resolve({ status: res.statusCode, body: b }));
        }).on('error', reject);
      });
    }

    function post(path, data) {
      return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request({
          hostname: 'localhost', port: 5678, path, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
          let b = ''; res.on('data', c => b += c);
          res.on('end', () => resolve({ status: res.statusCode, body: b }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }

    async function main() {
      // Step 1: Check if setup is needed
      const settings = await get('/rest/settings');
      let needsSetup = false;
      try {
        const data = JSON.parse(settings.body);
        needsSetup = data?.data?.userManagement?.showSetupOnFirstLoad === true;
        console.log('[n8n-init] showSetupOnFirstLoad=' + needsSetup);
      } catch(e) {
        console.log('[n8n-init] Could not parse settings (status=' + settings.status + ')');
        return;
      }

      if (!needsSetup) {
        console.log('[n8n-init] Owner exists - skipping');
        return;
      }

      // Step 2: Create owner
      const email = process.env.N8N_ADMIN_EMAIL || 'admin@pump.local';
      const password = process.env.N8N_ADMIN_PASSWORD || 'PumpAdmin123!';
      console.log('[n8n-init] Creating owner (' + email + ')...');

      const result = await post('/rest/owner/setup', {
        email, password, firstName: 'Pump', lastName: 'Admin'
      });
      console.log('[n8n-init] Setup response: status=' + result.status);

      if (result.status === 200) {
        console.log('[n8n-init] Owner created successfully');
      } else {
        console.log('[n8n-init] Setup failed: ' + result.body.substring(0, 200));

        // Step 3: Retry once after 5s (in case of race condition)
        console.log('[n8n-init] Retrying in 5s...');
        await new Promise(r => setTimeout(r, 5000));
        const retry = await post('/rest/owner/setup', {
          email, password, firstName: 'Pump', lastName: 'Admin'
        });
        console.log('[n8n-init] Retry response: status=' + retry.status);
        if (retry.status === 200) {
          console.log('[n8n-init] Owner created on retry');
        } else {
          console.log('[n8n-init] Retry failed: ' + retry.body.substring(0, 200));
        }
      }
    }

    main().catch(e => console.log('[n8n-init] Error: ' + e.message));
  "
fi

# Wait for n8n process (keeps container running)
wait $N8N_PID
