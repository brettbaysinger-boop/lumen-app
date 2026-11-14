"""Offline tests of scripts/animated_preview_memory.py with synthetic fixtures.

A stub systemctl, a fake /proc, a fake live checkout and a fake RMC install
with a real Unix socket that answers like the gateway's liveness probe. No
service, database, RMC install or account is touched.
"""
import os
import pwd
import socket
import stat
import subprocess
import sys
import threading
import unittest
from pathlib import Path
import tempfile

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "animated_preview_memory.py"
ME = pwd.getpwuid(os.geteuid()).pw_name
FICTIONAL_KEY = "fictional-host-key-" + "0123456789abcdef" * 3
FICTIONAL_SERVICE_KEY = "fictional-service-role-key-do-not-print"
PID = "4242"


class Gateway:
    """Answers every connection the way the RMC gateway answers a bare GET: 405."""

    def __init__(self, path: Path, answer=b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 20\r\n\r\n{\"outcome\":\"denied\"}"):
        self.requests = []
        self.server = socket.socket(socket.AF_UNIX)
        self.server.bind(str(path))
        os.chmod(path, 0o600)
        self.server.listen(8)
        self.answer = answer
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self):
        while True:
            try:
                connection, _ = self.server.accept()
            except OSError:
                return
            self.requests.append(connection.recv(4096))
            connection.sendall(self.answer)
            connection.close()

    def close(self):
        try:
            self.server.shutdown(socket.SHUT_RDWR)  # wakes the accept loop so the socket really closes
        except OSError:
            pass
        self.server.close()


class MemoryPreflight(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(os.path.realpath(self.temp.name))
        os.chmod(root, 0o700)
        self.root = root
        self.live = root / "live"
        (self.live / "backend").mkdir(parents=True)
        self.dotenv = self.live / "backend" / ".env"
        self.dotenv.write_text(f"SUPABASE_URL=http://supabase.invalid\nSUPABASE_SERVICE_ROLE_KEY={FICTIONAL_SERVICE_KEY}\n")
        self.proc = root / "proc"
        (self.proc / PID).mkdir(parents=True)
        os.symlink(self.live / "backend", self.proc / PID / "cwd")
        self.unit = {"ActiveState": "active", "MainPID": PID, "User": ME}
        self.rmc = root / "rmc-fictional01"
        for directory in (self.rmc, self.rmc / "run", self.rmc / "run" / "gateway", self.rmc / "keys",
                          self.rmc / "keys" / "gateway-hosts"):
            directory.mkdir(mode=0o700)
        self.key = self.rmc / "keys" / "gateway-hosts" / "lumen-host.key"
        self.key.write_text(FICTIONAL_KEY)
        os.chmod(self.key, 0o600)
        self.sock = self.rmc / "run" / "gateway" / "gateway.sock"
        self.gateway = Gateway(self.sock)
        self.addCleanup(lambda: self.gateway.close())
        self.rmc_env = {"LUMEN_MEMORY_BACKEND": "rmc", "RMC_INSTALLATION_ID": "fictional01",
                        "RMC_GATEWAY_SOCKET": str(self.sock), "RMC_HOST_KEY_FILE": str(self.key),
                        "RMC_TIMEOUT_SECONDS": "10"}
        self.live_env({})

    def live_env(self, values: dict, extra=b"PATH=/usr/bin\0OTHER_TOKEN=fictional-other-token\0"):
        body = extra + b"".join(f"{name}={value}".encode() + b"\0" for name, value in values.items())
        (self.proc / PID / "environ").write_bytes(body)

    def systemctl(self) -> str:
        stub = self.root / "systemctl"
        lines = ["#!/bin/sh", 'case "$3" in']
        lines += [f'  {name}) echo "{value}" ;;' for name, value in self.unit.items()]
        lines += ["  *) exit 1 ;;", "esac"]
        stub.write_text("\n".join(lines) + "\n")
        stub.chmod(0o755)
        return str(stub)

    def run_preflight(self, *command, shell_env=None):
        environment = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PYTHONDONTWRITEBYTECODE": "1"}
        environment.update(shell_env or {})
        arguments = [sys.executable, str(SCRIPT), "--live-dir", str(self.live), "--systemctl", self.systemctl(),
                     "--proc-root", str(self.proc)]
        if command:
            arguments += ["--exec", "--", *command]
        return subprocess.run(arguments, capture_output=True, text=True, env=environment, cwd=REPO / "backend", timeout=60)

    def started_environment(self, **kwargs):
        """Run the preflight with a command that records the memory settings it was started with."""
        marker = self.root / "started"
        code = ("import os,sys;open(sys.argv[1],'w').write('\\n'.join(f'{k}={v}' for k,v in sorted(os.environ.items())"
                " if k.startswith(('RMC_','LUMEN_MEMORY'))))")
        result = self.run_preflight(sys.executable, "-c", code, str(marker), **kwargs)
        started = dict(line.split("=", 1) for line in marker.read_text().splitlines()) if marker.exists() else None
        return result, started

    def snapshot(self):
        return sorted((str(path), path.lstat().st_mtime_ns, stat.S_IMODE(path.lstat().st_mode))
                      for base in (self.live, self.rmc) for path in [base, *base.rglob("*")])

    def assert_refused(self, result, started, *words):
        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        self.assertIsNone(started)
        self.assertIn("REFUSED", result.stderr)
        self.assertIn("was not started", result.stderr)
        for word in words:
            self.assertIn(word, result.stderr)

    def assert_no_secrets(self, result):
        output = result.stdout + result.stderr
        for secret in (FICTIONAL_KEY, FICTIONAL_SERVICE_KEY, "fictional-other-token"):
            self.assertNotIn(secret, output)

    # --- live store is Supabase ---------------------------------------------------
    def test_supabase_live_starts_preview_on_supabase(self):
        result, started = self.started_environment()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(started, {"LUMEN_MEMORY_BACKEND": "supabase"})
        self.assertIn("live memory store:    supabase", result.stdout)
        self.assertEqual(self.gateway.requests, [])

    def test_shell_cannot_switch_the_preview_to_a_different_store(self):
        for shell in ({"LUMEN_MEMORY_BACKEND": "rmc", **{k: v for k, v in self.rmc_env.items() if k != "LUMEN_MEMORY_BACKEND"}},
                      {"lumen_memory_backend": "rmc"}):
            result, started = self.started_environment(shell_env=shell)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(started, {"LUMEN_MEMORY_BACKEND": "supabase"})
        self.live_env(self.rmc_env)
        result, started = self.started_environment(shell_env={"LUMEN_MEMORY_BACKEND": "supabase", "RMC_INSTALLATION_ID": "other"})
        self.assertEqual(started, self.rmc_env)

    # --- live store is RMC --------------------------------------------------------
    def test_rmc_live_with_complete_configuration_starts_preview_on_the_same_rmc(self):
        self.live_env(self.rmc_env)
        before = self.snapshot()
        result, started = self.started_environment()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(started, self.rmc_env)
        self.assertIn("live memory store:    rmc", result.stdout)
        self.assertIn("preview memory store: rmc (same as live)", result.stdout)
        self.assert_no_secrets(result)
        self.assertEqual(self.snapshot(), before)
        # Only the liveness probe reached the gateway: no signed request, nothing admitted.
        self.assertEqual(len(self.gateway.requests), 1)
        self.assertTrue(self.gateway.requests[0].startswith(b"GET / HTTP/1.1"))
        self.assertNotIn(b"/v1/host/", b"".join(self.gateway.requests))

    def test_check_mode_starts_nothing(self):
        self.live_env(self.rmc_env)
        result = self.run_preflight()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Nothing was started or changed.", result.stdout)
        self.assert_no_secrets(result)

    def test_rmc_settings_in_the_live_dotenv_are_honoured_and_the_process_environment_wins(self):
        with self.dotenv.open("a") as handle:
            handle.write("".join(f'{name}="{value}"\n' for name, value in self.rmc_env.items()))
        result, started = self.started_environment()
        self.assertEqual(started, self.rmc_env)
        self.live_env({"LUMEN_MEMORY_BACKEND": "supabase"})
        result, started = self.started_environment()
        self.assertEqual(started, {"LUMEN_MEMORY_BACKEND": "supabase"})

    def test_refuses_incomplete_rmc_configuration(self):
        for missing in ("RMC_INSTALLATION_ID", "RMC_GATEWAY_SOCKET", "RMC_HOST_KEY_FILE"):
            self.live_env({name: value for name, value in self.rmc_env.items() if name != missing})
            result, started = self.started_environment()
            self.assert_refused(result, started, missing)
        self.live_env(dict(self.rmc_env, RMC_INSTALLATION_ID=""))
        self.assert_refused(*self.started_environment(), "RMC_INSTALLATION_ID")
        self.live_env(dict(self.rmc_env, RMC_INSTALLATION_ID="not a valid id!"))
        self.assert_refused(*self.started_environment(), "RMC_INSTALLATION_ID_INVALID")
        self.live_env(dict(self.rmc_env, RMC_TIMEOUT_SECONDS="soon"))
        self.assert_refused(*self.started_environment(), "RMC_TIMEOUT_SECONDS")

    def test_refuses_unsafe_or_missing_host_key(self):
        self.live_env(self.rmc_env)
        os.chmod(self.key, 0o644)
        result, started = self.started_environment()
        self.assert_refused(result, started, "RMC_HOST_KEY_MODE_UNSAFE")
        self.assert_no_secrets(result)
        os.chmod(self.key, 0o600)
        self.key.write_text("short")
        self.assert_refused(*self.started_environment(), "RMC_HOST_KEY_LENGTH_INVALID")
        self.key.unlink()
        self.assert_refused(*self.started_environment(), "RMC_HOST_KEY_MISSING")
        link = self.key.parent / "linked.key"
        target = self.root / "elsewhere.key"
        target.write_text(FICTIONAL_KEY)
        os.chmod(target, 0o600)
        os.symlink(target, link)
        self.live_env(dict(self.rmc_env, RMC_HOST_KEY_FILE=str(link)))
        self.assert_refused(*self.started_environment(), "RMC_HOST_KEY_SYMLINK")

    def test_refuses_unsafe_missing_or_silent_gateway_socket(self):
        self.live_env(self.rmc_env)
        os.chmod(self.sock, 0o666)
        self.assert_refused(*self.started_environment(), "RMC_GATEWAY_SOCKET_MODE_UNSAFE")
        os.chmod(self.sock, 0o600)
        os.chmod(self.sock.parent, 0o755)
        self.assert_refused(*self.started_environment(), "RMC_GATEWAY_SOCKET_DIR_UNSAFE")
        os.chmod(self.sock.parent, 0o700)
        self.gateway.close()
        self.assert_refused(*self.started_environment(), "does not answer")
        self.sock.unlink()
        self.assert_refused(*self.started_environment(), "RMC_GATEWAY_SOCKET_MISSING")
        self.sock.write_text("not a socket")
        os.chmod(self.sock, 0o600)
        self.assert_refused(*self.started_environment(), "RMC_GATEWAY_SOCKET_NOT_SOCKET")

    def test_refuses_a_gateway_that_does_not_give_the_liveness_answer(self):
        self.gateway.close()
        self.sock.unlink()
        self.gateway = Gateway(self.sock, answer=b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
        self.live_env(self.rmc_env)
        self.assert_refused(*self.started_environment(), "liveness")

    def test_refuses_when_the_preview_user_is_not_the_service_user(self):
        self.live_env(self.rmc_env)
        for user in ("someone-else", ""):
            self.unit["User"] = user
            self.assert_refused(*self.started_environment(), "only admits the service's own user")
        self.assertEqual(self.gateway.requests, [])

    # --- the live service cannot be confirmed ---------------------------------------
    def test_refuses_when_the_live_service_cannot_be_confirmed(self):
        self.live_env(self.rmc_env)
        for change, words in (({"ActiveState": "inactive"}, "is not running"), ({"ActiveState": "failed"}, "is not running"),
                              ({"MainPID": "0"}, "no main process"), ({"MainPID": "999999"}, "cannot inspect")):
            saved = dict(self.unit)
            self.unit.update(change)
            self.assert_refused(*self.started_environment(), words)
            self.unit = saved
        (self.proc / PID / "environ").unlink()
        self.assert_refused(*self.started_environment(), "cannot read the live service's environment")

    def test_refuses_when_systemd_is_unavailable_or_the_service_runs_elsewhere(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--live-dir", str(self.live), "--systemctl",
                                 str(self.root / "missing-systemctl"), "--proc-root", str(self.proc)],
                                capture_output=True, text=True, cwd=REPO / "backend")
        self.assertEqual(result.returncode, 3)
        self.assertIn("cannot ask systemd", result.stderr)
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        (self.proc / PID / "cwd").unlink()
        os.symlink(elsewhere, self.proc / PID / "cwd")
        self.assert_refused(*self.started_environment(), "does not run from")

    def test_refuses_unknown_store_and_unreadable_live_settings(self):
        self.live_env({"LUMEN_MEMORY_BACKEND": "something-else"})
        self.assert_refused(*self.started_environment(), "unknown memory store")
        self.live_env({})
        self.dotenv.unlink()
        self.assert_refused(*self.started_environment(), "cannot read")

    def test_refuses_when_preview_settings_do_not_load(self):
        self.dotenv.write_text("SUPABASE_URL=http://supabase.invalid\n")  # service key missing
        result, started = self.started_environment()
        self.assert_refused(result, started, "settings do not load")
        self.assert_no_secrets(result)

    # --- the launcher uses it ---------------------------------------------------------
    def test_launcher_starts_the_api_only_through_the_preflight(self):
        launcher = (REPO / "scripts" / "animated-preview.sh").read_text()
        lines = [line for line in launcher.splitlines() if not line.lstrip().startswith("#")]
        starts = [index for index, line in enumerate(lines) if "uvicorn" in line]
        self.assertEqual(len(starts), 1)
        self.assertIn("--exec --", lines[starts[0]])
        self.assertIn("animated_preview_memory.py", lines[starts[0] - 1])
        self.assertNotIn("LUMEN_MEMORY_BACKEND=", launcher)
        script = SCRIPT.read_text()
        for forbidden in ("LUMEN_RMC_CONFIRM", "/v1/host/", "restart", "daemon-reload", "sudo", "os.remove", "unlink"):
            self.assertNotIn(forbidden, script)
            self.assertNotIn(forbidden, launcher)

if __name__ == "__main__":
    unittest.main()
