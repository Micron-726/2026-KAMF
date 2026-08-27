#!/usr/bin/env python3
"""부스 로컬 서버 — Unity WebGL의 .gz 파일에 Content-Encoding: gzip 과 올바른 MIME을 붙인다.
기본 python -m http.server 로는 Unity WebGL 이 'Content-Encoding: gzip' 에러로 안 뜨는데,
이 서버로 열면 재빌드/설정 없이 그대로 동작한다. 카메라 때문에 반드시 localhost 로 연다.
확장자별 MIME 도 여기서 못박는다(아래 FORCED_TYPES) — OS 설정에 맡기면 부스 셸이 안 뜬다.

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

# .gz 로 압축된 Unity 파일의 "원본" 확장자 → Content-Type
UNDERLYING_TYPES = {
    ".wasm": "application/wasm",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".data": "application/octet-stream",
    ".symbols.json": "application/octet-stream",
}


# 확장자 → Content-Type 을 OS 와 무관하게 못박는다.
# Windows 는 레지스트리(HKCR)에서 MIME 을 읽어오는데 .mjs 가 text/plain 으로 등록된
# 환경이 흔하다. 그러면 브라우저의 strict MIME check 가 <script type="module"> 을
# 차단해서 booth/shell.mjs 가 통째로 실행되지 않는다 — 화면은 뜨는데 버튼이 전부
# 죽는 증상. 여기서 직접 지정해 어느 PC 에서든 같게 동작시킨다.
FORCED_TYPES = {
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".task": "application/octet-stream",   # MediaPipe 모델
    ".data": "application/octet-stream",   # Unity 에셋
}


class Handler(http.server.SimpleHTTPRequestHandler):
    # 압축 안 된 일반 파일용. .gz 는 send_head 가 따로 처리한다.
    def guess_type(self, path):
        ext = os.path.splitext(str(path))[1].lower()
        if ext in FORCED_TYPES:
            return FORCED_TYPES[ext]
        return super().guess_type(path)
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
