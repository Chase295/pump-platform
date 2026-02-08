#!/bin/sh
# n8n Owner Auto-Setup
# Creates the initial owner account on fresh deploys.
# Skips if owner already exists (idempotent).

N8N_URL="http://n8n:5678"
EMAIL="${N8N_ADMIN_EMAIL:-admin@pump.local}"
PASSWORD="${N8N_ADMIN_PASSWORD:-PumpAdmin123!}"

echo "=== n8n Init: Waiting for n8n to be ready ==="

# Wait for n8n healthz (max 60 attempts, 3s interval)
attempt=0
max_attempts=60
while [ $attempt -lt $max_attempts ]; do
  if curl -sf "${N8N_URL}/healthz" > /dev/null 2>&1; then
    echo "n8n is ready (attempt $((attempt + 1)))"
    break
  fi
  attempt=$((attempt + 1))
  echo "Waiting for n8n... ($attempt/$max_attempts)"
  sleep 3
done

if [ $attempt -eq $max_attempts ]; then
  echo "ERROR: n8n did not become ready after $max_attempts attempts"
  exit 1
fi

# Check if owner already exists via /rest/settings
echo "=== Checking if owner account exists ==="
settings=$(curl -sf "${N8N_URL}/rest/settings" 2>/dev/null)

if echo "$settings" | grep -q '"showSetupOnFirstLoad":false'; then
  echo "Owner account already exists - skipping setup"
  exit 0
fi

# Create owner account
echo "=== Creating owner account ==="
response=$(curl -sf -X POST "${N8N_URL}/rest/owner/setup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\",
    \"firstName\": \"Pump\",
    \"lastName\": \"Admin\"
  }" 2>&1)

if [ $? -eq 0 ]; then
  echo "Owner account created successfully (${EMAIL})"
else
  echo "ERROR creating owner account: ${response}"
  exit 1
fi

exit 0
