#!/usr/bin/env bash
set -euo pipefail

# Run as the desktop user, from the checked-out repository.
if [[ $(id -u) == 0 ]]; then
  echo 'Run this as your normal user, without sudo.' >&2
  exit 1
fi
project_dir=$(pwd)
test -x "$project_dir/backend/.venv/bin/uvicorn"
test -f "$project_dir/supabase/config.toml"
test -f "$project_dir/.env"
test -f "$project_dir/backend/.env"
if ! systemctl cat ollama.service >/dev/null 2>&1; then
  echo 'No ollama.service found. Share this message so we can configure its startup first.' >&2
  exit 1
fi
source "$HOME/.nvm/nvm.sh"
nvm use 22
tools_dir="$HOME/.local/share/lumen-tools"
npm install --prefix "$tools_dir" supabase
node_dir=$(dirname "$(command -v node)")
account_name=$(id -un)
unit_dir=$(mktemp -d)
trap 'rm -rf "$unit_dir"' EXIT
export project_dir tools_dir node_dir account_name unit_dir
python3 - <<'PY'
import os
from pathlib import Path
p, tools, node, user, dest = (os.environ[k] for k in
    ('project_dir', 'tools_dir', 'node_dir', 'account_name', 'unit_dir'))
home = str(Path.home())
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
common = f'User={user}\nWorkingDirectory={p}\nEnvironment="HOME={home}"\nEnvironment="PATH={node}:/usr/local/bin:/usr/bin:/bin"\n'
units = {
    'lumen-database': f'''[Unit]
Description=Lumen local Supabase
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
{common}ExecStart={quote(tools + '/node_modules/.bin/supabase')} start
StandardOutput=null
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
''',
    'lumen-api': f'''[Unit]
Description=Lumen cognition API
Requires=lumen-database.service
Wants=ollama.service
After=lumen-database.service ollama.service

[Service]
{common}WorkingDirectory={p}/backend
ExecStart={quote(p + '/backend/.venv/bin/uvicorn')} lumen.main:app --host 0.0.0.0 --port 8001
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
''',
    'lumen-web': f'''[Unit]
Description=Lumen local Expo web development server
Wants=lumen-api.service
After=lumen-api.service

[Service]
{common}Environment=CI=1
Environment=EXPO_NO_TELEMETRY=1
ExecStart={quote(node + '/node')} {quote(p + '/node_modules/expo/bin/cli')} start --web --localhost --port 8081
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
''',
}
for name, text in units.items():
    Path(dest, name + '.service').write_text(text)
PY
sudo install -m 644 "$unit_dir"/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable docker.service ollama.service lumen-database.service lumen-api.service lumen-web.service
sudo systemctl start lumen-database.service lumen-api.service lumen-web.service
echo 'Startup enabled. Open http://localhost:8081.'
echo 'Check: curl -sS http://127.0.0.1:8001/health'
