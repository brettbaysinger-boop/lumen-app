#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) == 0 ]]; then
  echo 'Run as your normal user, without sudo.' >&2
  exit 1
fi
project_dir=$(pwd)
test -f "$project_dir/scripts/lumen_backup.py"
test -f "$project_dir/supabase/config.toml"
backup_host=${1:-brett@100.121.251.39}
if [[ ! "$backup_host" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  echo 'Use user@hostname-or-IP for the backup target.' >&2
  exit 1
fi
key_path="$HOME/.ssh/lumen_backup_ed25519"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [[ ! -f "$key_path" ]]; then
  ssh-keygen -t ed25519 -f "$key_path" -N '' -C lumen-nightly-backup
fi
echo 'Install the dedicated backup public key on Helios. Its login password may be requested.'
ssh-copy-id -i "$key_path.pub" "$backup_host"
ssh -i "$key_path" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  "$backup_host" 'python3 --version'
config_dir="$HOME/.config/lumen-backup"
mkdir -p "$config_dir"
chmod 700 "$config_dir"
unit_dir=$(mktemp -d)
trap 'rm -rf "$unit_dir"' EXIT
export project_dir backup_host key_path config_dir unit_dir
python3 - <<'PY'
import os, json
from pathlib import Path
import pwd
project, host, key, config_dir, unit_dir = (os.environ[k] for k in
    ('project_dir', 'backup_host', 'key_path', 'config_dir', 'unit_dir'))
config = Path(config_dir) / 'config.json'
config.write_text(json.dumps({'project': project, 'ssh_host': host, 'ssh_key': key}, indent=2))
config.chmod(0o600)
user = pwd.getpwuid(os.getuid()).pw_name
def quote(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
service = f'''[Unit]
Description=Lumen nightly backup to Helios
Wants=lumen-database.service network-online.target
After=lumen-database.service network-online.target
StartLimitIntervalSec=0

[Service]
Type=oneshot
User={user}
WorkingDirectory={project}
Environment="HOME={Path.home()}"
UMask=0077
ExecStart=/usr/bin/python3 {quote(project + '/scripts/lumen_backup.py')} --config {quote(str(config))} backup
TimeoutStartSec=1800
Restart=on-failure
RestartSec=600
'''
timer = '''[Unit]
Description=Nightly Lumen backup at 3 AM Arizona time

[Timer]
OnCalendar=*-*-* 03:00:00 America/Phoenix
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
'''
Path(unit_dir, 'lumen-backup.service').write_text(service)
Path(unit_dir, 'lumen-backup.timer').write_text(timer)
PY
sudo install -m 644 "$unit_dir"/*.service "$unit_dir"/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lumen-backup.timer
sudo systemctl start lumen-backup.service
echo 'First backup completed. Run: python3 scripts/lumen_backup.py check'
