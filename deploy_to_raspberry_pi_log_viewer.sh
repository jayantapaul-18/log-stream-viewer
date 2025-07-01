#!/bin/bash

PI_USER="aiops"
PI_HOST="192.168.68.125"
PI_DIR="/home/aiops/pi-log-viewer"

echo "==> Copying project files to Raspberry Pi..."

# Copy current folder contents (except node_modules) to Pi
rsync -av --exclude node_modules --exclude '*.log' ./ $PI_USER@$PI_HOST:$PI_DIR

echo "==> Installing Node.js (if missing) and dependencies on Pi..."

ssh $PI_USER@$PI_HOST bash -c "'
  # Install Node.js if not installed
  if ! command -v node >/dev/null 2>&1; then
    echo \"Node.js not found, installing...\"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  # Install pm2 globally if missing
  if ! command -v pm2 >/dev/null 2>&1; then
    sudo npm install -g pm2
  fi

  cd $PI_DIR

  # Install dependencies
  npm install

  # Start the app with pm2, reload if already running
  pm2 describe pi-log-viewer >/dev/null 2>&1
  if [ \$? -eq 0 ]; then
    pm2 reload pi-log-viewer
  else
    pm2 start server.js --name pi-log-viewer
  fi

  pm2 save
'"

echo "==> Deployment finished. Logs viewer running at http://$PI_HOST:5008"
