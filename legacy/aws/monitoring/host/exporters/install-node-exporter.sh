#!/usr/bin/env bash
# install-node-exporter.sh
# Installs node_exporter 1.11.1 as a native host service on the target EC2 host.
# Run this directly on the target EC2 host (via SSH or SSM session).
# Must be run as a user with sudo privileges.

set -euo pipefail

NODE_EXPORTER_VERSION="1.11.1"
ARCH="linux-amd64"
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/node-exporter.service"
TARBALL="node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}.tar.gz"
DOWNLOAD_URL="https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/${TARBALL}"

echo "--- Installing node_exporter ${NODE_EXPORTER_VERSION} ---"

# Create dedicated user if it does not exist
if ! id -u node_exporter > /dev/null 2>&1; then
  sudo useradd --no-create-home --shell /bin/false node_exporter
  echo "Created node_exporter user"
fi

# Download and extract
cd /tmp
echo "Downloading ${DOWNLOAD_URL}"
wget -q "${DOWNLOAD_URL}"
tar xzf "${TARBALL}"

# Install binary
sudo cp "node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}/node_exporter" "${INSTALL_DIR}/node_exporter"
sudo chown node_exporter:node_exporter "${INSTALL_DIR}/node_exporter"
sudo chmod 755 "${INSTALL_DIR}/node_exporter"

# Clean up
rm -rf "node_exporter-${NODE_EXPORTER_VERSION}.${ARCH}" "${TARBALL}"

# Install systemd unit
# Use the node-exporter.service file from infra/monitoring/exporters/ in the repo,
# or write it inline here if deploying directly.
sudo tee "${SERVICE_FILE}" > /dev/null <<'EOF'
[Unit]
Description=Prometheus Node Exporter
After=network-online.target
Wants=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable node-exporter
sudo systemctl start node-exporter

echo ""
echo "--- Verification ---"
sudo systemctl status node-exporter --no-pager
echo ""
echo "Checking metrics endpoint..."
sleep 2
curl -fsSL http://127.0.0.1:9100/metrics | head -5

echo ""
echo "node_exporter ${NODE_EXPORTER_VERSION} installed and running."
echo "node_exporter listens on the host for Prometheus scraping. Do not open TCP 9100 in the AWS security group."
