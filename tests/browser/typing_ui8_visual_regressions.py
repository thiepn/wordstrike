"""Focused UI8 browser checks for the Typing Test visual-refinement contract."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import traceback

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "browser-artifacts"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def route_local(route, base):
    route.continue_() if route.request.url.startswith(base) else route.abort()


def open_test(page, base):
    page.goto(base + "?dev=1&mode=speed-test&seed=17")
    expect(page.locator(".speed-test-screen")).to_be_visible()
    expect(page.locator("#speed-test-word-flow")).to_be_visible()
    expect(page.locator(".speed-test-caret")).to_be_attached()


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    checks = []
    result = {"sha": os.getenv("GITHUB_SHA"), "checks": checks, "success": False}

    try:
        with sync_playwright() as playwright:
            # Desktop hierarchy and active-state feedback in both CI browsers.
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                context.route("**/*", lambda route: route_local(route, base))
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                open_test(page, base)

                ready = page.evaluate("""() => {
                  const screen = document.querySelector('.speed-test-screen');
                  const viewport = document.querySelector('#speed-test-word-viewport');
                  const flow = document.querySelector('#speed-test-word-flow');
                  const current = document.querySelector('.speed-test-word-current');
                  const controls = document.querySelector('.speed-test-controls-wrap');
                  const wpm = document.querySelector('#speed-test-wpm');
                  const accuracy = document.querySelector('#speed-test-accuracy');
                  return {
                    overflow: screen.scrollWidth - screen.clientWidth,
                    width: viewport.getBoundingClientRect().width,
                    viewportBorder: getComputedStyle(viewport).borderTopWidth,
                    passageFont: parseFloat(getComputedStyle(flow).fontSize),
                    currentUnderline: getComputedStyle(current, '::after').height,
                    controlsOpacity: parseFloat(getComputedStyle(controls).opacity),
                    wpmFont: parseFloat(getComputedStyle(wpm).fontSize),
                    accuracyFont: parseFloat(getComputedStyle(accuracy).fontSize),
                  };
                }""")
                assert ready["overflow"] <= 1, ready
                assert ready["width"] <= 1248.5, ready
                assert ready["viewportBorder"] == "0px", ready
                assert ready["passageFont"] >= 28, ready
                assert ready["currentUnderline"] != "0px", ready
                assert ready["controlsOpacity"] >= 0.95, ready
                assert ready["wpmFont"] > ready["accuracyFont"], ready

                page.locator("#speed-test-word-viewport").click(position={"x": 20, "y": 20})
                expect(page.locator("textarea.gameplay-input")).to_be_focused()
                first = page.evaluate("""async () => {
                  const {getCurrentSpeedTest} = await import('./js/speedTest.js');
                  return getCurrentSpeedTest().words[0][0];
                }""")
                wrong = "z" if first.lower() != "z" else "x"
                page.keyboard.type(first + wrong)
                expect(page.locator("#speed-test-status")).to_be_hidden()
                expect(page.locator(".speed-test-char-correct")).to_have_count(1)
                expect(page.locator(".speed-test-char-incorrect")).to_have_count(1)
                assert "typing-active" in (page.locator(".speed-test-screen").get_attribute("class") or "")

                active = page.evaluate("""() => {
                  const controls = document.querySelector('.speed-test-controls-wrap');
                  const error = document.querySelector('.speed-test-char-incorrect');
                  const caret = document.querySelector('.speed-test-caret');
                  return {
                    controlsOpacity: parseFloat(getComputedStyle(controls).opacity),
                    errorDecoration: getComputedStyle(error).textDecorationLine,
                    caretAnimation: getComputedStyle(caret, '::after').animationName,
                  };
                }""")
                assert active["controlsOpacity"] < 0.6, active
                assert "underline" in active["errorDecoration"], active
                assert active["caretAnimation"] == "none", active
                assert not errors, errors
                checks.append({"browser": browser_name, "case": "desktop hierarchy and active feedback"})
                context.close()
                browser.close()

            browser = playwright.chromium.launch(headless=True)

            # Phone matrix: secondary accuracy remains visible and page never overflows horizontally.
            for width, height in ((360, 640), (375, 667), (390, 844), (430, 932)):
                context = browser.new_context(viewport={"width": width, "height": height}, has_touch=True, is_mobile=True)
                context.route("**/*", lambda route: route_local(route, base))
                page = context.new_page()
                open_test(page, base)
                expect(page.locator("#speed-test-accuracy")).to_be_visible()
                mobile = page.evaluate("""() => {
                  const screen = document.querySelector('.speed-test-screen');
                  const config = document.querySelector('[data-speed-config="time-60"]');
                  const accuracy = document.querySelector('#speed-test-accuracy');
                  return {
                    overflow: screen.scrollWidth - screen.clientWidth,
                    configHeight: config.getBoundingClientRect().height,
                    accuracyDisplay: getComputedStyle(accuracy.parentElement).display,
                  };
                }""")
                assert mobile["overflow"] <= 1, (width, height, mobile)
                assert mobile["configHeight"] >= 43.5, (width, height, mobile)
                assert mobile["accuracyDisplay"] != "none", (width, height, mobile)
                if width == 390:
                    page.screenshot(path=str(ARTIFACTS / "ui8-mobile-390x844.png"), full_page=True)
                checks.append({"browser": "chromium", "case": f"mobile {width}x{height}", **mobile})
                context.close()

            # Reduced motion must suppress the idle caret animation.
            context = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce")
            context.route("**/*", lambda route: route_local(route, base))
            page = context.new_page()
            open_test(page, base)
            reduced = page.evaluate("""() => getComputedStyle(document.querySelector('.speed-test-caret'), '::after').animationName""")
            assert reduced == "none", reduced
            checks.append({"browser": "chromium", "case": "reduced motion caret"})
            context.close()

            # Results should read as analysis rather than a modal card, with WPM dominant.
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.route("**/*", lambda route: route_local(route, base))
            page = context.new_page()
            open_test(page, base)
            page.locator('[data-speed-category="words"]').click()
            page.locator('[data-speed-config="words-10"]').click()
            page.locator("#speed-test-word-viewport").click(position={"x": 20, "y": 20})
            words = page.evaluate("""async () => {
              const {getCurrentSpeedTest} = await import('./js/speedTest.js');
              return getCurrentSpeedTest().words.slice(0, 10);
            }""")
            page.keyboard.type(" ".join(words) + " ", delay=1)
            expect(page.locator(".speed-results-screen")).to_be_visible()
            results = page.evaluate("""() => {
              const panel = document.querySelector('.speed-results-panel');
              const metrics = [...document.querySelectorAll('.speed-result-headline strong')];
              return {
                panelBorder: getComputedStyle(panel).borderTopWidth,
                wpmFont: parseFloat(getComputedStyle(metrics[0]).fontSize),
                accuracyFont: parseFloat(getComputedStyle(metrics[1]).fontSize),
              };
            }""")
            assert results["panelBorder"] == "0px", results
            assert results["wpmFont"] > results["accuracyFont"] * 1.5, results
            page.screenshot(path=str(ARTIFACTS / "ui8-results.png"), full_page=True)
            checks.append({"browser": "chromium", "case": "results hierarchy", **results})
            context.close()
            browser.close()

        result["success"] = True
        print(f"PASS: {len(checks)} UI8 visual scenarios; all assertions passed.", flush=True)
    except Exception:
        result["error"] = traceback.format_exc()
        print(result["error"], flush=True)
        raise
    finally:
        (ARTIFACTS / "typing-ui8-regressions.json").write_text(json.dumps(result, indent=2))
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
