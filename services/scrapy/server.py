"""Servidor HTTP do SAVYRON Enrich (prospector-scrapy, PM2).

O worker Node comunica por HTTP assíncrono (POST /enrich). Este processo Python
executa o spider via subprocess (Scrapy isolado por request), com timeout curto.
Falhas de rede/site retornam sucesso com dados vazios — o worker tolera.
"""
import json
import os
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore

PORT = int(os.environ.get("SCRAPY_SERVICE_PORT", "6810"))
CONCURRENCY = int(os.environ.get("SCRAPY_CONCURRENCY", "2"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

_semaphore = BoundedSemaphore(max(1, CONCURRENCY))


def run_spider(url, timeout_ms):
    timeout = max(3.0, min(timeout_ms or 15000, 30000) / 1000.0)
    with _semaphore:
        fd, out_path = tempfile.mkstemp(suffix=".jsonl")
        os.close(fd)
        try:
            cmd = [
                sys.executable,
                "-m",
                "scrapy",
                "crawl",
                "enrichment",
                "-a",
                "url=%s" % url,
                "-o",
                out_path,
                "--nolog",
            ]
            proc = subprocess.run(
                cmd,
                cwd=BASE_DIR,
                timeout=timeout,
                capture_output=True,
            )
            del proc
            items = []
            if os.path.exists(out_path):
                with open(out_path, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            items.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            if not items:
                return {}
            item = items[0]
            return {
                "title": item.get("title"),
                "emails": item.get("emails") or [],
                "phones": item.get("phones") or [],
                "instagram": item.get("instagram"),
                "facebook": item.get("facebook"),
                "whatsapp": item.get("whatsapp"),
            }
        finally:
            try:
                os.remove(out_path)
            except OSError:
                pass


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/health", "/healthz"):
            self._json(200, {"success": True, "service": "prospector-scrapy"})
        else:
            self._json(404, {"success": False, "error": "not_found"})

    def do_POST(self):
        if self.path != "/enrich":
            self._json(404, {"success": False, "error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"success": False, "error": "invalid_json"})
            return
        url = (body.get("url") or "").strip()
        if not url or not url.startswith(("http://", "https://")):
            self._json(400, {"success": False, "error": "url_invalid"})
            return
        try:
            data = run_spider(url, int(body.get("timeoutMs") or 15000))
            self._json(200, {"success": True, "data": data})
        except Exception as exc:  # noqa: BLE001 - serviço tolerante a falhas
            self._json(200, {"success": True, "data": {}, "error": str(exc)})

    def log_message(self, *args):  # loga no padrão do PM2 (stdout)
        print(*args)


def run():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    run()
