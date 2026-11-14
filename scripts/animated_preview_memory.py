#!/usr/bin/env python3
"""Fail-closed memory preflight for the Animated Companion preview API.

The preview API is a second Lumen API process. It must use the same memory
store as the live service, or it must not start. This script:

1. reads the effective memory settings of the running live service (the
   service's own process environment, then the live backend/.env, then the
   built-in default), without changing anything;
2. when the live store is RMC, checks the installation ID, gateway socket,
   host key and service user with the same adapter checks the live API uses,
   and the gateway's existing liveness probe (a request that admits nothing);
3. confirms that the preview's settings resolve to exactly the live values;
4. only then, with --exec, starts the given command with those settings.

It never activates, deactivates, migrates or modifies RMC, never reads or
writes a memory, and never prints a secret, a token or a key. On any doubt it
exits with status 3 and starts nothing.
"""
from __future__ import annotations

import argparse
import os
import pwd
import socket
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
KEYS = ("LUMEN_MEMORY_BACKEND", "RMC_INSTALLATION_ID", "RMC_GATEWAY_SOCKET", "RMC_HOST_KEY_FILE",
        "RMC_TIMEOUT_SECONDS")
RMC_REQUIRED = KEYS[1:4]
REFUSED = 3


class Refuse(Exception):
    pass


def unit_property(systemctl: str, unit: str, name: str) -> str:
    try:
        result = subprocess.run([systemctl, "show", "-p", name, "--value", unit], capture_output=True,
                                text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as exc:
        raise Refuse(f"cannot ask systemd about {unit}") from exc
    if result.returncode != 0:
        raise Refuse(f"cannot ask systemd about {unit}")
    return result.stdout.strip()


def process_settings(proc_root: str, pid: int) -> dict[str, str]:
    """The memory settings in the live process's environment. Other variables are never kept."""
    try:
        with open(os.path.join(proc_root, str(pid), "environ"), "rb") as handle:
            raw = handle.read()
    except OSError as exc:
        raise Refuse("cannot read the live service's environment (run as the service's user)") from exc
    found = {}
    for item in raw.split(b"\0"):
        name, separator, value = item.partition(b"=")
        if separator and name.decode(errors="replace") in KEYS:
            found[name.decode()] = value.decode(errors="replace")
    return found


def dotenv_settings(path: str) -> dict[str, str]:
    """The memory settings in a dotenv file. Other lines are never kept."""
    found = {}
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except OSError as exc:
        raise Refuse(f"cannot read {path}") from exc
    for line in lines:
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, value = line.partition("=")
        name = name.strip().upper()
        if not separator or name not in KEYS:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        found[name] = value
    return found


def live_settings(args) -> tuple[dict[str, str], str]:
    """Effective memory settings of the running live service, and the user it runs as."""
    state = unit_property(args.systemctl, args.unit, "ActiveState")
    if state != "active":
        raise Refuse(f"{args.unit} is not running (state: {state or 'unknown'}), so its memory store cannot be confirmed")
    pid_text = unit_property(args.systemctl, args.unit, "MainPID")
    if not pid_text.isdigit() or int(pid_text) <= 0:
        raise Refuse(f"{args.unit} has no main process")
    pid = int(pid_text)
    user = unit_property(args.systemctl, args.unit, "User")
    live_backend_dir = os.path.realpath(os.path.join(args.live_dir, "backend"))
    try:
        working = os.path.realpath(os.readlink(os.path.join(args.proc_root, str(pid), "cwd")))
    except OSError as exc:
        raise Refuse("cannot inspect the live service's process (run as the service's user)") from exc
    if working != live_backend_dir:
        raise Refuse(f"{args.unit} does not run from {live_backend_dir}; set LIVE_DIR to the live checkout")
    settings = dotenv_settings(os.path.join(live_backend_dir, ".env"))
    settings.update(process_settings(args.proc_root, pid))   # the process environment wins, as in the API
    return {name: value for name, value in settings.items() if value != ""}, user


def check_rmc(settings: dict[str, str], service_user: str):
    """Everything the live API needs to reach RMC, checked without admitting any request."""
    missing = [name for name in RMC_REQUIRED if name not in settings]
    if missing:
        raise Refuse("live service uses RMC but these settings are missing: " + ", ".join(missing))
    me = pwd.getpwuid(os.geteuid()).pw_name
    if not service_user or service_user != me:
        raise Refuse(f"the live service runs as '{service_user or 'unknown'}' but the preview would run as '{me}'; "
                     "the RMC gateway only admits the service's own user")
    try:
        timeout = float(settings.get("RMC_TIMEOUT_SECONDS", "10"))
    except ValueError as exc:
        raise Refuse("RMC_TIMEOUT_SECONDS is not a number") from exc
    from types import SimpleNamespace
    from lumen.rmc.client import RmcConfigError, load_config, validate_socket
    try:
        config = load_config(SimpleNamespace(rmc_installation_id=settings["RMC_INSTALLATION_ID"],
                                             rmc_gateway_socket=settings["RMC_GATEWAY_SOCKET"],
                                             rmc_host_key_file=settings["RMC_HOST_KEY_FILE"],
                                             rmc_timeout_seconds=timeout))
        validate_socket(config.socket_path)
    except RmcConfigError as exc:
        raise Refuse(f"the Lumen RMC adapter refuses this configuration ({exc.code})") from exc
    del config  # holds the host key; it is never printed or passed on
    # The gateway's liveness probe, as scripts/lumen-rmc.sh uses it: a bare GET is
    # answered 405 and nothing is admitted, read or written.
    try:
        with socket.socket(socket.AF_UNIX) as probe:
            probe.settimeout(5)
            probe.connect(settings["RMC_GATEWAY_SOCKET"])
            probe.sendall(b"GET / HTTP/1.1\r\nHost: rmc\r\nConnection: close\r\n\r\n")
            answered = probe.recv(64).split(b" ")[1:2] == [b"405"]
    except OSError as exc:
        raise Refuse("the RMC gateway does not answer on its socket") from exc
    if not answered:
        raise Refuse("the RMC gateway did not give its liveness answer")


def preview_environment(settings: dict[str, str]) -> dict[str, str]:
    """The preview's environment: the live memory settings, and none of its own."""
    environment = {name: value for name, value in os.environ.items() if name.upper() not in KEYS}
    environment.update(settings)
    environment.setdefault("LUMEN_MEMORY_BACKEND", "supabase")
    return environment


def confirm_preview_matches(environment: dict[str, str], settings: dict[str, str], live_env_file: str):
    """Load the preview's real settings object and compare it with the live values."""
    saved = dict(os.environ)
    try:
        os.environ.clear()
        os.environ.update(environment)
        from lumen.config import Settings
        try:
            loaded = Settings(_env_file=live_env_file)
        except Exception as exc:  # pydantic reports the field names only
            raise Refuse(f"the preview's settings do not load ({type(exc).__name__})") from exc
    finally:
        os.environ.clear()
        os.environ.update(saved)
    expected = settings.get("LUMEN_MEMORY_BACKEND", "supabase")
    if loaded.lumen_memory_backend != expected:
        raise Refuse("the preview would not use the live memory store")
    if expected == "rmc":
        pairs = ((loaded.rmc_installation_id, "RMC_INSTALLATION_ID"), (loaded.rmc_gateway_socket, "RMC_GATEWAY_SOCKET"),
                 (loaded.rmc_host_key_file, "RMC_HOST_KEY_FILE"))
        if any(value != settings[name] for value, name in pairs):
            raise Refuse("the preview's RMC settings differ from the live service's")


def preflight(args) -> dict[str, str]:
    backend_dir = os.path.join(REPO, "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    import lumen
    if os.path.dirname(os.path.realpath(lumen.__file__)) != os.path.join(os.path.realpath(backend_dir), "lumen"):
        raise Refuse("Python did not load Lumen from the preview clone")
    settings, user = live_settings(args)
    backend = settings.get("LUMEN_MEMORY_BACKEND", "supabase")
    if backend not in ("supabase", "rmc"):
        raise Refuse("the live service has an unknown memory store setting")
    print(f"live memory store:    {backend} ({args.unit}, running as {user or 'unknown'})")
    if backend == "rmc":
        check_rmc(settings, user)
        print(f"RMC installation:     {settings['RMC_INSTALLATION_ID']}")
        print("RMC gateway socket:   accepted by the Lumen adapter, gateway answers")
        print("RMC host key:         accepted by the Lumen adapter (not shown)")
    else:
        settings = {name: value for name, value in settings.items() if name == "LUMEN_MEMORY_BACKEND"}
    environment = preview_environment(settings)
    confirm_preview_matches(environment, settings, os.path.join(os.path.realpath(args.live_dir), "backend", ".env"))
    print(f"preview memory store: {backend} (same as live)")
    return environment


def main(argv=None) -> int:
    # Usage: ... [options] [--exec -- COMMAND ...]; everything after --exec is the command to start.
    argv = list(sys.argv[1:] if argv is None else argv)
    command = []
    if "--exec" in argv:
        position = argv.index("--exec")
        argv, command = argv[:position], argv[position + 1:]
        if command[:1] == ["--"]:
            command = command[1:]
        if not command:
            print("REFUSED: --exec needs a command. The preview API was not started.", file=sys.stderr)
            return REFUSED
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live-dir", required=True, help="the live Lumen checkout (read only)")
    parser.add_argument("--unit", default=os.environ.get("LUMEN_API_UNIT", "lumen-api"))
    # The next two exist for the offline tests only.
    parser.add_argument("--systemctl", default=os.environ.get("LUMEN_PREVIEW_SYSTEMCTL", "systemctl"))
    parser.add_argument("--proc-root", default=os.environ.get("LUMEN_PREVIEW_PROC_ROOT", "/proc"))
    args = parser.parse_args(argv)
    try:
        environment = preflight(args)
    except Refuse as refusal:
        print(f"REFUSED: {refusal}. The preview API was not started.", file=sys.stderr)
        return REFUSED
    if not command:
        print("Memory preflight passed. Nothing was started or changed.")
        return 0
    sys.stdout.flush()
    os.execvpe(command[0], command, environment)
    return REFUSED  # not reached


if __name__ == "__main__":
    sys.exit(main())
