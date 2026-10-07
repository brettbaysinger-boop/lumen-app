#!/usr/bin/env bash
set -euo pipefail
lumen_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lumen_node="$(command -v node)"
if [[ "$lumen_root$lumen_node" =~ [[:space:]%] ]]; then
  echo 'Install paths containing whitespace or % need manual systemd escaping.' >&2
  exit 1
fi
test -f "$lumen_root/dist/index.html"
systemctl cat lumen-web.service >/dev/null
sudo install -d /etc/systemd/system/lumen-web.service.d
printf '[Service]\nWorkingDirectory=%s\nExecStart=\nExecStart=%s %s/scripts/serve-web.cjs\nEnvironment=PORT=8081\nEnvironment=HOST=0.0.0.0\n' \
  "$lumen_root" "$lumen_node" "$lumen_root" |
  sudo tee /etc/systemd/system/lumen-web.service.d/50-static-export.conf >/dev/null
sudo systemctl daemon-reload
echo 'Web service configured to serve dist on port 8081. Restart it to apply.'
