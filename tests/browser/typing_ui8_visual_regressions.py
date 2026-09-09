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


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    checks = []
    result = {"sha": os.getenv("GITHUB_SHA"), "checks": checks, "success": False}

    try:
        with sync_playwright() as playwright:
            # Desktop hierarchy and state transition in both supported CI browsers.
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(base + "?dev=1&mode=speed-test&seed=17")
                expect(page.locator(".speed-test-screen")).to_be_visible()
                expect(page.locator("#speed-test-word-flow")).to_be_visible()

                hierarchy = page.evaluate("""() => {
                  const screen = document.querySelector('.speed-test-screen');
                  const viewport = document.querySelector('#speed-test-word-viewport');
                  const flow = document.querySelector('#speed-test-word-flow');
                  const current = document.querySelector('.speed-test-word-current');
                  const wpm = document.querySelector('#speed-test-wpm');
                  const accuracy = document.querySelector('#speed-test-accuracy');
                  const controls = document.querySelector('.speed-test-controls-wrap');
                  const caret = document.querySelector('.speed-test-caret');
                  const box = viewport.getBoundingClientRect();
                  return {
                    overflow: screen.scrollWidth - screen.clientWidth,
                    width: box.width,
                    viewportBorderTop: getComputedStyle(viewport).borderTopWidth,
                    passageFont: parseFloat(getComputedStyle(flow).fontSize),
                    currentColor: getComputedStyle(current).color,
                    currentUnderline: getComputedStyle(current, '::after').height,
                    wpmFont: parseFloat(getComputedStyle(wpm).fontSize),
                    accuracyFont: parseFloat(getComputedStyle(accuracy).fontSize),
                    controlsOpacity: parseFloat(getComputedStyle(controls).opacity),
                    caretAnimation: caret ? getComputedStyle(caret, '::after').animationName : null,
                  };
                }""")
                assert hierarchy["overflow"] <= 1, hierarchy
                assert hierarchy["width"] <= 1060.5, hierarchy
                assert hierarchy["viewportBorderTop"] == "0px", hierarchy
                assert hierarchy["passageFont"] >= 28, hierarchy
                assert hierarchy["wpmFont"] > hierarchy["accuracyFont"], hierarchy
                assert hierarchy["currentUnderline"] != "0px", hierarchy
                assert hierarchy["controlsOpacity"] >= 0.95, hierarchy

                page.locator("#speed-test-word-viewport").click(position={"x": 20, "y": 20})
                expect(page.locator("textarea.gameplay-input")).to_be_focused()
                expected = page.evaluate("""async () => {
                  const {getCurrentSpeedTest} = await import('./js/speedTest.js');
                  return getCurrentSpeedTest().words[0];
                }""")
                first = expected[0]
                wrong = "z" if first.lower() != "z" else "x"
                page.keyboard.type(first + wrong)
                assert "typing-active" in (page.locator(".speed-test-screen").get_attribute("class") or "")
                expect(page.locator("#speed-test-status")).to_be_hidden()
                expect(page.locator(".speed-test-char-correct")).to_have_count(1)
                expect(page.locator(".speed-test-char-incorrect")).to_have_count(1)

                active = page.evaluate("""() => {
                  const controls = document.querySelector('.speed-test-controls-wrap');
                  const error = document.querySelector('.speed-test-char-incorrect');
                  const caret = document.querySelector('.speed-test-caret');
                  const errorStyle = getComputedStyle(error);
                  return {
                    controlsOpacity: parseFloat(getComputedStyle(controls).opacity),
                    errorDecoration: errorStyle.textDecorationLine,
                    caretAnimation: getComputedStyle(caret, '::after').animationName,
                  };
                }""")
                assert active["controlsOpacity"] < 0.6, active
                assert "underline" in active["errorDecoration"], active
                assert active["caretAnimation"] == "none", active
                assert not errors, errors
                checks.append({"browser": browser_name, "case": "hierarchy, feedback and active-state decluttering"})
                context.close()
                browser.close()

            # Mobile matrix: accuracy remains present, touch targets remain practical, no page overflow.
            browser = playwright.chromium.launch(headless=True)
            for width, height in ((360, 640), (375, 667), (390, 844), (430, 932)):
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    has_touch=True,
                    is_mobile=True,
                )
                context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                page = context.new_page()
                page.goto(base + "?dev=1&mode=speed-test&seed=17")
                expect(page.locator("#speed-test-accuracy")).to_be_visible()
                mobile = page.evaluate("""() => {
                  const screen = document.querySelector('.speed-test-screen');
                  const config = document.querySelector('[data-speed-config="time-60"]');
                  const accuracy = document.querySelector('#speed-test-accuracy');
                  const rect = config.getBoundingClientRect();
                  return {
                    overflow: screen.scrollWidth - screen.clientWidth,
                    configHeight: rect.height,
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

            # Reduced-motion contract: no caret animation.
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                reduced_motion="reduce",
            )
            context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            page = context.new_page()
            page.goto(base + "?dev=1&mode=speed-test&seed=17")
            reduced = page.evaluate("""() => {
              const caret = document.querySelector('.speed-test-caret');
              return getComputedStyle(caret, '::after').animationName;
            }""")
            assert reduced == "none", reduced
            checks.append({"browser": "chromium", "case": "prefers-reduced-motion disables caret animation"})
            context.close()

            # Results are an analytical state: WPM dominates, the panel is not a heavy card, retry is obvious.
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            page = context.new_page()
            page.goto(base + "?dev=1&mode=speed-test&seed=17")
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
              const retry = document.querySelector('[data-action="retry"]');
              return {
                panelBorder: getComputedStyle(panel).borderTopWidth,
                wpmFont: parseFloat(getComputedStyle(metrics[0]).fontSize),
                accuracyFont: parseFloat(getComputedStyle(metrics[1]).fontSize),
                retryColor: getComputedStyle(retry).color,
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
