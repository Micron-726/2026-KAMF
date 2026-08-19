#!/usr/bin/env python3
"""부스 로컬 서버 — Unity WebGL의 .gz 파일에 Content-Encoding: gzip 과 올바른 MIME을 붙인다.
기본 python -m http.server 로는 Unity WebGL 이 'Content-Encoding: gzip' 에러로 안 뜨는데,
이 서버로 열면 재빌드/설정 없이 그대로 동작한다. 카메라 때문에 반드시 localhost 로 연다.

사용법:
    cd <이 프로젝트 폴더>
    python3 serve.py            # http://localhost:8000/booth/booth.html
    python3 serve.py 8080       # 포트 바꾸기
"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

UNDERLYING_TYPES = {
    ".wasm": "application/wasm",
    ".js": "application/javascript",
    ".data": "application/octet-stream",
    ".symbols.json": "application/octet-stream",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if path.endswith(".gz") and os.path.isfile(path):
            base = path[:-3]
            ctype = "application/octet-stream"
            for ext, t in UNDERLYING_TYPES.items():
                if base.endswith(ext):
                    ctype = t
                    break
            try:
                f = open(path, "rb")
            except OSError:
                self.send_error(404, "File not found")
                return None
            fs = os.fstat(f.fileno())
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(fs.st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return f
        return super().send_head()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving {os.getcwd()}")
        print(f"→  http://localhost:{PORT}/booth/booth.html")
        print("Ctrl+C 로 종료")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
