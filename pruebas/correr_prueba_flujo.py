import threading, http.server, socketserver, functools, time, os
from playwright.sync_api import sync_playwright
import sys
NM=os.path.join(os.getcwd(),"node_modules/firebase/")  # npm i firebase@10.14.1
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(("127.0.0.1",8781),functools.partial(Q,directory=os.path.dirname(os.getcwd()))); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    pg=b.new_page()
    def r(route):
        u=route.request.url
        if "gstatic.com/firebasejs/" in u:
            f=u.split("/")[-1].split("?")[0]
            return route.fulfill(status=200,content_type="text/javascript",body=open(NM+f,encoding="utf-8").read())
        if "127.0.0.1" in u or "localhost" in u: return route.continue_()
        return route.abort()
    pg.route("**/*",r)
    errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8781/pruebas/prueba_flujo.html")
    try: pg.wait_for_function("document.getElementById('out').textContent.includes('FIN')",timeout=240000)
    except Exception as e: print("TIMEOUT", e.__class__.__name__)
    print(pg.inner_text("#out")); print("pageerrors:",errs)
    b.close()
