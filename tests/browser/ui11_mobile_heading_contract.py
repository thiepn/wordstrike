"""UI11 narrow leaderboard heading contract."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]

SEED = """(() => {
  for (const [id, version] of Object.entries({general:3,campaign:1,typing:1,endless:1,boss:1,leaderboards:1,'arcade-rush':1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${version}`, 'seen');
})();"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def certify(browser, base, width):
    context = browser.new_context(viewport={"width": width, "height": 760})
    context.add_init_script(SEED)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
    page = context.new_page()
    page.goto(base)
    page.locator('[data-action="open-leaderboards"]').click()
    heading = page.locator('.leaderboards-screen[data-ui11-surface="leaderboards"] .leaderboards-panel > h1')
    expect(heading).to_be_visible()

    geometry = heading.evaluate("""(h) => {
      const text = h.textContent || '';
      const word = 'LEADERBOARDS';
      const start = text.indexOf(word);
      const node = [...h.childNodes].find(n => n.nodeType === Node.TEXT_NODE && (n.textContent || '').includes(word));
      if (!node || start < 0) return {wordRects: 99, lineRects: 99};
      const localStart = (node.textContent || '').indexOf(word);
      const wordRange = document.createRange();
      wordRange.setStart(node, localStart);
      wordRange.setEnd(node, localStart + word.length);
      const allRange = document.createRange();
      allRange.selectNodeContents(h);
      const visible = rects => [...rects].filter(r => r.width > 0.5 && r.height > 0.5);
      return {
        wordRects: visible(wordRange.getClientRects()).length,
        lineRects: visible(allRange.getClientRects()).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fontSize: parseFloat(getComputedStyle(h).fontSize),
      };
    }""")

    assert geometry["wordRects"] == 1, (width, geometry)
    assert geometry["lineRects"] <= 2, (width, geometry)
    assert geometry["overflow"] <= 1, (width, geometry)
    assert geometry["fontSize"] <= 40.5, (width, geometry)
    context.close()
    return geometry


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as playwright:
            for browser_name in ("chromium", "firefox"):
                browser = getattr(playwright, browser_name).launch(headless=True)
                checks = [certify(browser, base, width) for width in (390, 320)]
                browser.close()
                print(f"PASS: {browser_name} UI11 mobile leaderboard heading {checks}", flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
