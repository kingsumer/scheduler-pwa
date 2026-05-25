"""
排课App PWA - 本地测试服务器
用法: python server.py [端口号]
默认端口: 8080
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class PWAHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加CORS头，允许本地测试
        self.send_header('Access-Control-Allow-Origin', '*')
        # 正确设置MIME类型
        if self.path.endswith('.wasm'):
            self.send_header('Content-Type', 'application/wasm')
        if self.path.endswith('.js'):
            self.send_header('Content-Type', 'application/javascript')
        # Service Worker需要正确的MIME类型
        if self.path.endswith('sw.js'):
            self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()
    
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

with socketserver.TCPServer(("", PORT), PWAHandler) as httpd:
    print(f"========================================")
    print(f"  排课App PWA 本地服务器")
    print(f"  http://localhost:{PORT}")
    print(f"  http://localhost:{PORT}/index.html")
    print(f"========================================")
    print(f"  iOS测试:")
    print(f"  1. 确保iPhone和电脑在同一WiFi")
    print(f"  2. 用电脑IP访问: http://电脑IP:{PORT}")
    print(f"  3. Safari中打开后「添加到主屏幕」")
    print(f"========================================")
    print(f"  按 Ctrl+C 停止服务器")
    print(f"========================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
