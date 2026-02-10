#!/bin/sh
# Configure Kubo CORS to accept all origins (needed for Web UI behind reverse proxy)
# This runs via container-init.d before the IPFS daemon starts

ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET", "POST", "PUT", "DELETE", "OPTIONS"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Content-Type", "Authorization", "X-Requested-With"]'
