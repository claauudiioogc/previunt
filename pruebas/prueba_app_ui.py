"""Prueba de punta a punta de la app real (index.html + app.js) contra los emuladores de Firebase.
Necesita: emuladores corriendo (ver LEEME.md), `node preparar_emuladores.mjs` recién ejecutado,
`npm i` en esta carpeta (firebase@10.14.1 y leaflet@1.9.4) y Playwright para Python.
Uso:  python3 prueba_app_ui.py        (guarda capturas en pruebas/capturas/)
"""
import functools, http.server, json, os, socketserver, threading, time, urllib.request
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
NM = os.path.join(AQUI, "node_modules")
P, EMU = "demo-previunt3", "http://127.0.0.1:9099"
CAPT = os.path.join(AQUI, "capturas"); os.makedirs(CAPT, exist_ok=True)
CAMPUS = {"latitude": -8.1135, "longitude": -79.0370, "accuracy": 15}
FUERA = {"latitude": -8.1200, "longitude": -79.0400, "accuracy": 15}
CIUDAD = {"latitude": -8.0750, "longitude": -79.0050, "accuracy": 15}

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 8782), functools.partial(Q, directory=RAIZ))
threading.Thread(target=srv.serve_forever, daemon=True).start()

def emu_json(ruta):
    return json.load(urllib.request.urlopen(f"{EMU}/emulator/v1/projects/{P}/{ruta}"))
def codigo_sms(tel):
    return [c for c in emu_json("verificationCodes")["verificationCodes"] if c["phoneNumber"] == tel][-1]["code"]
def db_get(ruta):
    return json.load(urllib.request.urlopen(f"http://127.0.0.1:9000/{ruta}.json?ns={P}&access_token=owner"))

ok = mal = 0
def t(nombre, f):
    global ok, mal
    try: f(); ok += 1; print("OK   ", nombre)
    except Exception as e: mal += 1; print("FALLA", nombre, "→", str(e)[:300])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    def nuevo(geo=CIUDAD):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, geolocation=geo, permissions=["geolocation"], locale="es-PE", service_workers="block")
        pg = ctx.new_page()
        def ruta(route):
            u = route.request.url
            if "gstatic.com/firebasejs/" in u:
                return route.fulfill(status=200, content_type="text/javascript", body=open(os.path.join(NM, "firebase", u.split("/")[-1].split("?")[0]), encoding="utf-8").read())
            if "unpkg.com/leaflet@1.9.4/dist/" in u:
                f = u.split("/dist/")[1].split("?")[0]
                return route.fulfill(status=200, content_type="text/css" if f.endswith(".css") else "text/javascript", body=open(os.path.join(NM, "leaflet", "dist", f), encoding="utf-8").read())
            if "127.0.0.1" in u or "localhost" in u: return route.continue_()
            return route.abort()
        pg.route("**/*", ruta)
        pg.errores = []
        pg.on("pageerror", lambda e: pg.errores.append(str(e)))
        pg.goto("http://localhost:8782/?emu=1")
        pg.wait_for_function("document.querySelector('#badgeConexion').textContent.includes('En línea')", timeout=30000)
        return ctx, pg
    def toast(pg, texto, ms=15000):
        pg.wait_for_function(f"document.querySelector('#toast').textContent.includes({json.dumps(texto)})", timeout=ms)
    def llenar(pg, campos):
        for k, v in campos.items(): pg.fill("#" + k, v)

    ctx, pg = nuevo()
    t("invitado: el botón de cuenta dice Entrar", lambda: pg.wait_for_function("document.querySelector('#cuentaTexto').textContent === 'Entrar'", timeout=10000))
    def sin_control():
        pg.goto("http://localhost:8782/?emu=1&admin=1")
        pg.wait_for_function("document.querySelector('#badgeConexion').textContent.includes('En línea')", timeout=30000)
        for _ in range(5): pg.click("#logo")
        pg.wait_for_timeout(1500)
        if pg.is_visible(".nav-autoridad"): raise Exception("Control visible para un invitado")
    t("no hay pestaña Control ni con ?admin=1 ni con 5 toques", sin_control)
    def reportar_pide_login():
        pg.click("#btnReportarInicio")
        pg.wait_for_selector("#formLogin", state="visible", timeout=5000)
        if "Inicia sesión" not in pg.inner_text("#cuentaMotivo"): raise Exception(pg.inner_text("#cuentaMotivo"))
        pg.screenshot(path=f"{CAPT}/01_login.png")
    t("invitado toca Reportar → hoja Inicia sesión con el motivo", reportar_pide_login)

    def registro_personal():
        pg.click("[data-pantalla-ir=registro]")
        pg.wait_for_selector("#formRegistro", state="visible")
        pg.click("#btnCrearCuenta")  # vacío → errores
        pg.wait_for_function("document.querySelector('[data-error=nombres]').textContent.length > 0")
        pg.screenshot(path=f"{CAPT}/02_registro_errores.png", full_page=True)
        llenar(pg, {"regNombres": "Ana", "regApellidos": "Mora Ríos", "regUsuario": "ana_m", "regCelular": "987654321", "regCorreo": "ana@gmail.com", "regDni": "12345678", "regClave": "secreta12", "regClave2": "secreta12"})
        pg.click("#regDni"); pg.wait_for_function("document.querySelector('#regUsuarioEstado').textContent === 'Disponible'", timeout=8000)
        pg.click("#btnCrearCuenta")
        pg.wait_for_selector("#formSMS", state="visible", timeout=20000)
        pg.screenshot(path=f"{CAPT}/03_sms.png")
        pg.fill("#smsCodigo", "000000"); pg.click("#btnConfirmarSMS")
        pg.wait_for_function("document.querySelector('#smsError').textContent.includes('no es correcto')", timeout=10000)
        pg.fill("#smsCodigo", codigo_sms("+51987654321")); pg.click("#btnConfirmarSMS")
        pg.wait_for_selector("#formReporte", state="visible", timeout=15000)  # vuelve a lo que quería hacer: reportar
        pg.wait_for_function("document.querySelector('#cuentaTexto').textContent === 'ana_m'", timeout=10000)
    t("registro personal desde la app: errores, código incorrecto, código correcto → abre el reporte", registro_personal)

    def ana_reporta():
        pg.click("[data-tipo=huaico]")
        pg.fill("#inputDesc", "lodo en la pista")
        pg.wait_for_function("!document.querySelector('#btnEnviarReporte').disabled", timeout=15000)
        if pg.is_visible("#fsAmbito"): raise Exception("la cuenta personal no debería elegir ámbito")
        pg.screenshot(path=f"{CAPT}/04_reporte_ciudad.png")
        pg.click("#btnEnviarReporte")
        toast(pg, "Tu reporte se envió", 20000)
        reps = db_get("reportes")
        r = list(reps.values())[0]
        if r["ambito"] != "ciudad" or "confirmaciones" in r: raise Exception(json.dumps(r))
    t("ana reporta en la ciudad (llega con ámbito y sin conteos)", ana_reporta)

    def ana_sale_y_entra():
        pg.click("#btnCuenta"); pg.wait_for_selector("[data-pantalla=micuenta]", state="visible")
        pg.click("#mcDetalles summary"); pg.wait_for_function("document.querySelector('#mcDatos').textContent.includes('12345678')", timeout=8000)
        pg.screenshot(path=f"{CAPT}/05_mi_cuenta.png", full_page=True)
        pg.once("dialog", lambda d: d.accept())
        pg.click("#btnCerrarSesion")
        pg.wait_for_function("document.querySelector('#cuentaTexto').textContent === 'Entrar'", timeout=10000)
        pg.click("#btnCuenta"); pg.fill("#loginUsuario", "Ana_M"); pg.fill("#loginClave", "malamala"); pg.click("#btnEntrar")
        pg.wait_for_function("document.querySelector('#loginError').textContent.includes('incorrectos')", timeout=10000)
        pg.fill("#loginClave", "secreta12"); pg.click("#btnEntrar")
        pg.wait_for_function("document.querySelector('#cuentaTexto').textContent === 'ana_m'", timeout=10000)
    t("Mi cuenta muestra los datos privados; cerrar sesión; clave mala; entrar con usuario", ana_sale_y_entra)
    id_rep = list(db_get("reportes").keys())[0]

    # Segunda persona: beto vota el reporte de ana
    ctx2, pg2 = nuevo()
    def beto_vota():
        pg2.evaluate(f"PREVIUNT.verReporteEnMapa({json.dumps(id_rep)})")
        pg2.wait_for_selector(".popup-rep", timeout=10000)
        if pg2.query_selector(".popup-rep [data-voto]"): raise Exception("un invitado no debería ver botones de voto")
        if "Inicia sesión" not in pg2.inner_text(".popup-rep .nota-voto"): raise Exception(pg2.inner_text(".popup-rep"))
        if "ana_m" not in pg2.inner_text(".popup-rep .popup-autor"): raise Exception("no muestra el autor")
        pg2.screenshot(path=f"{CAPT}/06_popup_invitado.png")
        pg2.click(".popup-rep [data-cuenta-ir]")
        pg2.wait_for_selector("#formLogin", state="visible")
        pg2.click("[data-pantalla-ir=registro]")
        llenar(pg2, {"regNombres": "Beto", "regApellidos": "Ruiz", "regUsuario": "beto_r", "regCelular": "912345678", "regCorreo": "beto@gmail.com", "regDni": "76543210", "regClave": "secreta12", "regClave2": "secreta12"})
        pg2.click("#btnCrearCuenta"); pg2.wait_for_selector("#formSMS", state="visible", timeout=20000)
        pg2.fill("#smsCodigo", codigo_sms("+51912345678")); pg2.click("#btnConfirmarSMS")
        toast(pg2, "celular está verificado")
        pg2.evaluate(f"PREVIUNT.verReporteEnMapa({json.dumps(id_rep)})")
        pg2.wait_for_selector(".popup-rep [data-voto='1']", timeout=10000)
        pg2.click(".popup-rep [data-voto='1']")
        toast(pg2, "Gracias")
        v = db_get(f"votos/{id_rep}")
        if len(v) != 1 or list(v.values())[0]["v"] != 1: raise Exception(json.dumps(v))
        pg2.evaluate(f"PREVIUNT.verReporteEnMapa({json.dumps(id_rep)})")
        pg2.wait_for_function("document.querySelector('.popup-rep') && document.querySelector('.popup-rep').textContent.includes('Ya respondiste')", timeout=10000)
    t("beto (invitado) ve el motivo, se registra desde el popup y vota una vez", beto_vota)
    t("ana ve 1 confirmación en su reporte", lambda: pg.wait_for_function(f"PREVIUNT.S.reportes[{json.dumps(id_rep)}].confirmaciones === 1", timeout=10000))

    # UNT
    ctx3, pg3 = nuevo(CAMPUS)
    def registro_unt():
        pg3.click("#btnCuenta"); pg3.click("[data-pantalla-ir=registro]"); pg3.click("[data-tipo-cuenta=unt]")
        llenar(pg3, {"regNombres": "Luis", "regApellidos": "Paz", "regUsuario": "luis_unt", "regCelular": "955555555", "regCorreo": "ana@gmail.com", "regDni": "12345678", "regClave": "unitru123", "regClave2": "unitru123"})
        pg3.click("#btnCrearCuenta")
        pg3.wait_for_function("document.querySelector('[data-error=correo]').textContent.includes('unitru')")
        pg3.fill("#regCorreo", "luis@unitru.edu.pe"); pg3.click("#btnCrearCuenta")
        pg3.wait_for_selector("[data-pantalla=correo]", state="visible", timeout=20000)
        pg3.screenshot(path=f"{CAPT}/07_correo_unt.png")
        if pg3.is_hidden("#cuentaPunto"): raise Exception("debería verse el punto de aviso")
        pg3.click("#btnYaVerifique"); pg3.wait_for_function("document.querySelector('#correoError').textContent.includes('Todavía')", timeout=10000)
        oob = [c for c in emu_json("oobCodes")["oobCodes"] if c["email"] == "luis@unitru.edu.pe" and c["requestType"] == "VERIFY_EMAIL"][-1]
        urllib.request.urlopen(EMU + "/" + oob["oobLink"].split("/", 3)[3])
        pg3.click("#btnYaVerifique"); toast(pg3, "cuenta UNT está verificada")
    t("registro UNT: correo no UNT rechazado; enlace; «Ya verifiqué»", registro_unt)
    def unt_reporta_campus():
        pg3.wait_for_selector("#chipCampus", state="visible", timeout=15000)
        pg3.click("#btnReportarInicio"); pg3.wait_for_selector("#formReporte", state="visible")
        if not pg3.is_visible("#fsAmbito") or not pg3.is_hidden("#selectorForma"): raise Exception("ámbito/forma mal")
        pg3.click("[data-tipo=inundacion]")
        pg3.wait_for_function("!document.querySelector('#btnEnviarReporte').disabled", timeout=15000)
        pg3.screenshot(path=f"{CAPT}/08_reporte_campus.png", full_page=True)
        pg3.click("#btnEnviarReporte"); toast(pg3, "Tu reporte se envió", 20000)
        if not any(r.get("ambito") == "unt" for r in db_get("reportes").values()): raise Exception("no llegó el reporte UNT")
    t("UNT dentro del campus: chip, formulario del campus y envío", unt_reporta_campus)
    def unt_sale():
        ctx3.set_geolocation(FUERA)
        pg3.wait_for_selector("#chipCampus", state="hidden", timeout=40000)
        pg3.click("#btnReportarInicio"); pg3.wait_for_timeout(500)
        if pg3.is_visible("#formReporte"): raise Exception("fuera del campus no debería abrir el formulario")
        toast(pg3, "solo reportas dentro del campus")
    t("UNT fuera del campus: desaparece el chip y no puede reportar", unt_sale)

    # Admin
    ctx4, pg4 = nuevo()
    def admin():
        pg4.click("#btnCuenta"); pg4.fill("#loginUsuario", "clau_udio"); pg4.fill("#loginClave", "clave-prueba-1"); pg4.click("#btnEntrar")
        pg4.wait_for_selector(".nav-autoridad", state="visible", timeout=15000)
        pg4.click(".nav-autoridad")
        pg4.wait_for_function("document.querySelector('#adminConexion').textContent.includes('clau_udio')", timeout=10000)
        pg4.uncheck("#chkSimular"); pg4.fill("#inputFuenteOficial", "Prueba emulador"); pg4.click(".btn-nivel[data-nivel='1']")
        toast(pg4, "Publicado")
        if db_get("quebrada_san_ildefonso")["nivel"] != 1: raise Exception("no cambió el nivel")
        pg4.screenshot(path=f"{CAPT}/09_control_admin.png", full_page=True)
    t("admin clau_udio: ve Control y publica el nivel", admin)
    def bloquear():
        pg4.click("[data-gestion=todos]")
        pg4.once("dialog", lambda d: d.accept())
        pg4.click(f"#adminReportes [data-acc=bloquear][data-id={json.dumps(id_rep)}]")
        toast(pg4, "Autor bloqueado")
        pg.wait_for_function("document.querySelector('#cuentaPunto') && PREVIUNT.S.bloqueados[PREVIUNT.Datos.uid] === true", timeout=10000)
        pg.click("#btnReportarInicio"); toast(pg, "bloqueada")
    t("admin bloquea a ana y ana ya no puede reportar", bloquear)
    def admin_sale():
        pg4.once("dialog", lambda d: d.accept())
        pg4.click("#btnSalirAutoridad")
        pg4.wait_for_selector(".nav-autoridad", state="hidden", timeout=10000)
    t("admin cierra sesión desde Control → sin pestaña Control", admin_sale)

    for nombre, x in (("invitado/ana", pg), ("beto", pg2), ("luis", pg3), ("admin", pg4)):
        t(f"sin errores de JavaScript ({nombre})", lambda x=x: (_ for _ in ()).throw(Exception("; ".join(x.errores))) if x.errores else None)
    b.close()
print(f"\nFIN {ok} OK, {mal} fallas")
