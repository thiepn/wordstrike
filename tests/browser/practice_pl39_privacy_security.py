"""PL39 browser-level privacy/security certification for Practice Lab.

Uses a local-only HTTP harness and Chromium. No external service is required.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import socket

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts" / "pl39-privacy-security"
PRIVATE_SENTINEL = "PL39_PRIVATE_SENTINEL_BROWSER_7F31E8"
PRIVATE_WORD = "plthirtynineprivatetokenxyz"
XSS_PAYLOADS = [
    "<script>window.__pl39Xss=1</script>",
    "<img src=x onerror=window.__pl39Xss=2>",
    "<svg onload=window.__pl39Xss=3>",
    '<a href="javascript:window.__pl39Xss=4">x</a>',
    "</textarea><script>window.__pl39Xss=5</script>",
    "<style>body{display:none}</style>",
]


class HarnessHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/pl39-harness.html":
            body = b"<!doctype html><meta charset=utf-8><title>PL39 Harness</title><main id=root></main>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    port = free_port()
    handler = lambda *args, **kwargs: HarnessHandler(*args, directory=str(ROOT), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"

    report = {
        "version": 1,
        "privateSentinel": "synthetic-redacted",
        "xssPayloadCount": len(XSS_PAYLOADS),
        "requests": [],
        "consoleMessages": [],
        "checks": [],
        "status": "FAIL",
    }

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context()
            page = context.new_page()

            def on_request(request):
                report["requests"].append({
                    "method": request.method,
                    "origin": request.url.split("/", 3)[:3],
                    "url": request.url,
                    "resourceType": request.resource_type,
                    "bodySize": len(request.post_data or ""),
                    "body": request.post_data or "",
                    "headers": dict(request.headers),
                })

            page.on("request", on_request)
            page.on("console", lambda message: report["consoleMessages"].append(message.text))
            page.add_init_script("""
                (() => {
                  window.__pl39ApiCalls = [];
                  const remember = (kind, value='') => window.__pl39ApiCalls.push({kind, value:String(value)});
                  const originalFetch = window.fetch.bind(window);
                  window.fetch = (...args) => { remember('fetch', args[0]); return originalFetch(...args); };
                  const OriginalXHR = window.XMLHttpRequest;
                  window.XMLHttpRequest = class extends OriginalXHR {
                    open(method, url, ...rest) { this.__pl39Method = method; this.__pl39Url = url; return super.open(method, url, ...rest); }
                    send(body) { remember('xhr', `${this.__pl39Method || ''} ${this.__pl39Url || ''} ${body || ''}`); return super.send(body); }
                  };
                  if (navigator.sendBeacon) {
                    const originalBeacon = navigator.sendBeacon.bind(navigator);
                    navigator.sendBeacon = (url, data) => { remember('beacon', `${url} ${data || ''}`); return originalBeacon(url, data); };
                  }
                  if (window.WebSocket) {
                    const OriginalWebSocket = window.WebSocket;
                    window.WebSocket = class extends OriginalWebSocket {
                      constructor(url, protocols) { remember('websocket', url); super(url, protocols); }
                    };
                  }
                  window.__pl39Xss = 0;
                })();
            """)
            page.goto(f"{base}/pl39-harness.html")

            result = page.evaluate("""async ({privateSentinel, privateWord, payloads}) => {
              const [{createPracticeMemoryStore}, {createPracticeCustomTextRepository}, {auditPracticeStoredData}, renderer, researchUi] = await Promise.all([
                import('/js/practiceLab/practiceMemoryStore.js'),
                import('/js/practiceLab/practiceCustomTextRepository.js'),
                import('/js/practiceLab/practiceIntegrityAudit.js'),
                import('/js/practiceLab/practiceLabRendererV31.js'),
                import('/js/practiceLab/practiceResearchUi.js'),
              ]);
              const profileId = 'practice-profile_pl39-browser-profile-12345678';
              const dataStore = createPracticeMemoryStore();
              const repository = createPracticeCustomTextRepository({dataStore, now:()=>new Date('2026-09-14T00:00:00.000Z')});
              const source = `alpha ${privateSentinel} ${privateWord} ${payloads.join(' | ')} omega`;
              const saved = await repository.createCustomText({profileId, title: payloads[1], sourceText: source, dataLocale:'en'});
              const storageAudit = await auditPracticeStoredData(dataStore, {privateSentinels:[privateSentinel]});

              const root = document.querySelector('#root');
              const view = {
                kind:'custom-text-detail', status:'editing', starting:false, saving:false, localeMismatch:false, validationErrorCode:null,
                editor:{customTextId:saved.customTextId,title:payloads[1],sourceText:source},
                texts:[{customTextId:saved.customTextId,title:payloads[2],sourceGraphemeCount:source.length,lastPractisedAt:null}],
                sourceGraphemeCount:source.length,contextDataLocale:'en',dirty:true,sessionMode:'full-text',timedAvailability:[],timedDurationMs:60000,errorCode:null,
              };
              renderer.renderPracticeCustomTextDetail(root, view);
              const editorSource = root.querySelector('[data-custom-text-source]').value;
              const editorTitle = root.querySelector('[data-custom-text-title]').value;
              const libraryTitle = root.querySelector('[data-custom-text-library] strong').textContent;
              const executableNodes = root.querySelectorAll('script,img,svg,style,a[href^="javascript:"]').length;
              const sentinelMounted = root.textContent.includes(privateSentinel) || editorSource.includes(privateSentinel);

              const researchRoot = document.createElement('div');
              researchUi.renderPracticeResearchPage(researchRoot, researchUi.buildPracticeResearchViewModel({
                status:'unavailable', errorCode:payloads[0]
              }));
              const researchExecutable = researchRoot.querySelectorAll('script,img,svg,style,a[href^="javascript:"]').length;

              const beforeUrl = location.href;
              history.pushState({screen:'practice', marker:'bounded'}, '', '#practice-audit');
              const historyText = JSON.stringify(history.state || {});
              const urls = [location.pathname, location.search, location.hash, historyText, beforeUrl].join('|');

              const cacheHits = [];
              if ('caches' in window) {
                for (const cacheName of await caches.keys()) {
                  const cache = await caches.open(cacheName);
                  for (const request of await cache.keys()) {
                    const response = await cache.match(request);
                    const text = response ? await response.clone().text().catch(()=> '') : '';
                    if (request.url.includes(privateSentinel) || text.includes(privateSentinel)) cacheHits.push({cacheName,url:request.url});
                  }
                }
              }
              const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
              return {
                savedId:saved.customTextId,
                storageValid:storageAudit.valid,
                sentinelHits:storageAudit.sentinelHits,
                editorSourceMatches:editorSource===source,
                editorTitleMatches:editorTitle===payloads[1],
                libraryTitleMatches:libraryTitle===payloads[2],
                executableNodes,
                researchExecutable,
                xssFlag:window.__pl39Xss,
                sentinelMounted,
                urlLeak:urls.includes(privateSentinel) || urls.includes(privateWord) || payloads.some((p)=>urls.includes(p)),
                cacheHits,
                serviceWorkerRegistrations:registrations.length,
                apiCalls:window.__pl39ApiCalls,
                storedRecords:Object.fromEntries(await Promise.all(['customTexts','skillStats','sessionSummaries','physicalTelemetryStats','physicalTelemetrySessions','researchEnrollments','researchAssignments','researchAnalysisStates'].map(async store=>[store,(await dataStore.list(store)).length]))),
              };
            }""", {"privateSentinel": PRIVATE_SENTINEL, "privateWord": PRIVATE_WORD, "payloads": XSS_PAYLOADS})

            assert result["storageValid"], result
            assert result["sentinelHits"] == [{"kind": "private", "storeName": "customTexts", "recordId": result["savedId"], "path": "sourceText"}], result
            assert result["editorSourceMatches"] and result["editorTitleMatches"] and result["libraryTitleMatches"], result
            assert result["executableNodes"] == 0 and result["researchExecutable"] == 0 and result["xssFlag"] == 0, result
            assert not result["urlLeak"], result
            assert not result["cacheHits"], result
            assert result["serviceWorkerRegistrations"] == 0, result
            assert result["storedRecords"]["customTexts"] == 1, result
            for store in ["skillStats", "sessionSummaries", "physicalTelemetryStats", "physicalTelemetrySessions", "researchEnrollments", "researchAssignments", "researchAnalysisStates"]:
                assert result["storedRecords"][store] == 0, (store, result)

            prohibited_methods = {"POST", "PUT", "PATCH", "DELETE"}
            for request in report["requests"]:
                request_blob = json.dumps(request, sort_keys=True)
                assert request["method"] not in prohibited_methods, request
                assert PRIVATE_SENTINEL not in request_blob and PRIVATE_WORD not in request_blob, request
                assert not any(payload in request_blob for payload in XSS_PAYLOADS), request
                assert request["url"].startswith(base), request
            for call in result["apiCalls"]:
                serialized = json.dumps(call, sort_keys=True)
                assert PRIVATE_SENTINEL not in serialized and PRIVATE_WORD not in serialized, call
            for message in report["consoleMessages"]:
                assert PRIVATE_SENTINEL not in message and PRIVATE_WORD not in message, message
                assert not any(payload in message for payload in XSS_PAYLOADS), message

            report["checks"] = [
                "Custom Text private sentinel persisted only in customTexts.sourceText",
                "six XSS payload classes rendered literally without executable DOM nodes",
                "Research error text escaped",
                "zero Practice network write requests",
                "no private sentinel/hash-like payload in request URL/body/header",
                "no Custom Text sentinel in URL/history",
                "no Custom Text sentinel in Cache Storage/service-worker cache",
                "no private sentinel in console output",
                "arbitrary private word produced zero persistent PL11 word entities",
            ]
            report["status"] = "PASS"
            (ARTIFACTS / "report.json").write_text(json.dumps({
                **report,
                "requests": [{k:v for k,v in request.items() if k not in {"body","headers","url"}} | {"path": request["url"].split(base,1)[-1]} for request in report["requests"]],
                "consoleMessages": ["<redacted>" if PRIVATE_SENTINEL in message else message for message in report["consoleMessages"]],
                "browserResult": {k:v for k,v in result.items() if k not in {"apiCalls"}},
            }, indent=2), encoding="utf-8")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    print(json.dumps({"status": report["status"], "requestCount": len(report["requests"]), "checks": report["checks"]}, indent=2))


if __name__ == "__main__":
    run()
