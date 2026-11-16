"""BigLust SDXL v1.6 as the default still-image workflow: shape, placeholders, provenance and the
read-only Heavy check script. Fakes only; nothing reaches Heavy."""
import json
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from lumen.images import ComfyUIProvider, ImageProviderNotConfigured, workflow_model_name

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "backend" / "workflows" / "biglust-sdxl-v16-api.json"
CHECKPOINT = "bigLust_v16.safetensors"   # fictional name for tests only


def settings(**overrides):
    values = dict(comfyui_url="http://heavy.test:8188", comfyui_workflow=str(WORKFLOW), image_generation_timeout=30,
                  comfyui_checkpoint=CHECKPOINT, comfyui_negative_prompt="lowres, child, minor")
    values.update(overrides)
    return SimpleNamespace(**values)


class WorkflowShapeTests(unittest.TestCase):
    def test_is_a_complete_sdxl_checkpoint_graph(self):
        graph = json.loads(WORKFLOW.read_text())
        by_type = {node["class_type"]: (key, node) for key, node in graph.items()}
        loader_key, loader = by_type["CheckpointLoaderSimple"]
        self.assertEqual(loader["inputs"]["ckpt_name"], "{{LUMEN_CHECKPOINT}}")
        _, sampler = by_type["KSampler"]
        self.assertEqual(sampler["inputs"]["model"], [loader_key, 0])
        self.assertEqual(sampler["inputs"]["seed"], "{{LUMEN_SEED}}")
        _, decode = by_type["VAEDecode"]
        self.assertEqual(decode["inputs"]["vae"], [loader_key, 2])       # SDXL VAE from the checkpoint
        _, latent = by_type["EmptyLatentImage"]                           # SDXL latent, not a FLUX one
        w, h = latent["inputs"]["width"], latent["inputs"]["height"]
        self.assertTrue(w % 64 == 0 and h % 64 == 0 and 900_000 <= w * h <= 1_100_000)
        texts = [n["inputs"]["text"] for n in graph.values() if n["class_type"] == "CLIPTextEncode"]
        self.assertEqual(sorted(texts), ["{{LUMEN_NEGATIVE}}", "{{LUMEN_PROMPT}}"])
        self.assertTrue(all(n["inputs"]["clip"] == [loader_key, 1] for n in graph.values()
                            if n["class_type"] == "CLIPTextEncode"))
        self.assertIn("SaveImage", by_type)
        self.assertNotIn("UNETLoader", by_type)
        self.assertNotIn("EmptyFlux2LatentImage", by_type)


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_placeholders_and_provenance(self):
        provider = ComfyUIProvider(settings())
        graph = provider._load_workflow("a lighthouse at dusk")
        loader = next(n for n in graph.values() if n["class_type"] == "CheckpointLoaderSimple")
        self.assertEqual(loader["inputs"]["ckpt_name"], CHECKPOINT)
        self.assertIn("lowres, child, minor", json.dumps(graph))
        self.assertIsInstance(next(n for n in graph.values() if n["class_type"] == "KSampler")["inputs"]["seed"], int)
        self.assertEqual(provider.model_name, CHECKPOINT)

    def test_missing_checkpoint_is_a_clear_configuration_error(self):
        with self.assertRaises(ImageProviderNotConfigured) as caught:
            ComfyUIProvider(settings(comfyui_checkpoint=""))._load_workflow("x")
        self.assertIn("COMFYUI_CHECKPOINT", str(caught.exception))

    def test_flux_workflow_provenance_names_its_unet(self):
        flux = json.loads((ROOT / "backend" / "workflows" / "flux2-klein-4b-fp8.json").read_text())
        self.assertEqual(workflow_model_name(flux), "flux-2-klein-4b-fp8.safetensors")

    async def test_generate_reports_the_checkpoint_as_the_model(self):
        def handler(request: httpx.Request):
            if request.url.path == "/prompt":
                body = json.loads(request.content)["prompt"]
                assert any(n["inputs"].get("ckpt_name") == CHECKPOINT for n in body.values())
                return httpx.Response(200, json={"prompt_id": "p1"})
            if request.url.path == "/history/p1":
                return httpx.Response(200, json={"p1": {"status": {}, "outputs": {"7": {"images": [
                    {"filename": "Raialume_sdxl_0001.png", "subfolder": "", "type": "output"}]}}}})
            if request.url.path == "/view":
                return httpx.Response(200, content=b"PNG", headers={"content-type": "image/png"})
            return httpx.Response(404)
        original = httpx.AsyncClient
        with patch("lumen.images.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            result = await ComfyUIProvider(settings()).generate("a lighthouse")
        self.assertEqual((result["model"], result["mime_type"], result["bytes"]), (CHECKPOINT, "image/png", b"PNG"))


class FakeComfy(BaseHTTPRequestHandler):
    checkpoints = ["sd_xl_base_1.0.safetensors", CHECKPOINT]

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/system_stats":
            body = {"system": {"comfyui_version": "0.3.test"}, "devices": [{"name": "RTX test"}]}
        elif self.path == "/object_info/CheckpointLoaderSimple":
            body = {"CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [self.checkpoints]}}}}
        elif self.path.startswith("/object_info/"):
            name = self.path.split("/")[-1]
            body = {name: {}} if name in ("CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage") else {}
        else:
            self.send_response(404); self.end_headers(); return
        data = json.dumps(body).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
        self.wfile.write(data)

    def do_POST(self):  # the check must never queue anything
        raise AssertionError("read-only check sent a POST")


class CheckScriptTests(unittest.TestCase):
    def run_check(self, checkpoint):
        server = HTTPServer(("127.0.0.1", 0), FakeComfy)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            return subprocess.run([sys.executable, str(ROOT / "scripts" / "check-comfyui-image-workflow.py"),
                                   "--url", f"http://127.0.0.1:{server.server_port}", "--workflow", str(WORKFLOW),
                                   "--checkpoint", checkpoint], capture_output=True, text=True, timeout=30)
        finally:
            server.shutdown()

    def test_ready_when_checkpoint_and_nodes_exist(self):
        result = self.run_check(CHECKPOINT)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn(f"BigLust candidate: {CHECKPOINT}", result.stdout)
        self.assertIn("RESULT: READY", result.stdout)

    def test_not_ready_when_checkpoint_is_misnamed(self):
        result = self.run_check("biglust.safetensors")
        self.assertEqual(result.returncode, 1)
        self.assertIn("MISSING", result.stdout)


class CanaryScriptTests(unittest.TestCase):
    def test_refuses_without_explicit_gpu_flag(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / "canary-comfyui-image.py"),
                                 "--url", "http://127.0.0.1:9", "--workflow", str(WORKFLOW),
                                 "--checkpoint", CHECKPOINT, "--out", "/tmp/x"], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2)
        self.assertIn("--run-gpu", result.stdout)

    def test_png_size_reader(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import importlib.util
        spec = importlib.util.spec_from_file_location("canary", ROOT / "scripts" / "canary-comfyui-image.py")
        canary = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(canary)
        header = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + (832).to_bytes(4, "big") + (1216).to_bytes(4, "big")
        self.assertEqual(canary.png_size(header), (832, 1216))
        self.assertIsNone(canary.png_size(b"not a png"))
