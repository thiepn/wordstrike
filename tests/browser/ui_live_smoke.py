"""Read-only production smoke check after Pages deploys this exact UI release.

No authentication, leaderboard submission or completed session is performed.
Both browser contexts are fresh and their local-only test state is discarded.
"""
import hashlib
import json
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright, expect
from ui_strike_studio import SEED

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'browser-artifacts' / 'ui-live-smoke'
BASE = 'https://thiepn.dev/wordstrike/'
ASSETS = ['index.html', 'styles/strike-studio.css', 'js/strikeStudioPresentation.js',
          'js/flow/flowUiPhase7Polish.js', 'js/flow/flowRuntimeLoader.js', 'sw.js']


def deployed_assets(timeout=480):
    expected = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in ASSETS}
    deadline = time.monotonic() + timeout
    pending = dict(expected)
    while time.monotonic() < deadline:
        for path, digest in list(pending.items()):
            try:
                req = Request(BASE + path, headers={'Cache-Control': 'no-cache', 'User-Agent': 'WordStrike-release-check'})
                with urlopen(req, timeout=15) as response:
                    data = response.read()
                    assert response.status == 200
                if hashlib.sha256(data).hexdigest() == digest:
                    del pending[path]
            except Exception as error:
                print(f'Waiting for {path}: {type(error).__name__}', flush=True)
        if not pending:
            return expected
        print('Waiting for this revision to reach Pages: ' + ', '.join(pending), flush=True)
        time.sleep(10)
    raise AssertionError('Published asset mismatch: ' + ', '.join(pending))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'sha': os.getenv('GITHUB_SHA'), 'base': BASE, 'success': False, 'checks': []}
    try:
        report['assetSha256'] = deployed_assets()
        with sync_playwright() as p:
            for kind in (p.chromium, p.firefox):
                browser = kind.launch()
                try:
                    for width in (1440, 390):
                        context = browser.new_context(viewport={'width': width, 'height': 900 if width > 800 else 844}, reduced_motion='reduce')
                        context.add_init_script(SEED)
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda e: errors.append(str(e)))
                        response = page.goto(BASE, wait_until='domcontentloaded')
                        assert response and response.ok
                        expect(page.locator('.title-screen[data-studio-ready="true"]')).to_be_visible(timeout=30000)
                        expect(page.locator('.studio-headline')).to_have_text('MAKE EVERYKEY COUNT.')
                        page.wait_for_function("document.querySelector('.title-brand-label img').naturalWidth > 0")
                        page.screenshot(path=str(OUT / f'{kind.name}-{width}-home.png'), full_page=True)
                        page.locator('[data-action="modes"]').click()
                        expect(page.locator('.studio-mode-icon')).to_have_count(5)
                        page.locator('button[data-mode-id="flow"]').click()
                        expect(page.locator('[aria-label="Selected Flow run setup"]')).to_contain_text('3 sections', timeout=30000)
                        page.locator('[data-flow-action="start"]').click()
                        expect(page.locator('[data-flow-view="run"]')).to_be_visible(timeout=30000)
                        text = page.evaluate('window.wordstrikeFlowPhase1.getRunPlan().segments[0].text.slice(0,80)')
                        page.keyboard.type(text, delay=20)
                        assert page.evaluate('window.wordstrikeFlowPhase1.getSnapshot().currentIndex') == len(text)
                        overflow = page.evaluate('document.documentElement.scrollWidth - innerWidth')
                        assert overflow <= 1, overflow
                        page.screenshot(path=str(OUT / f'{kind.name}-{width}-flow.png'), full_page=True)
                        assert not errors, errors
                        report['checks'].append({'browser': kind.name, 'width': width, 'typedCharacters': len(text), 'overflow': overflow})
                        context.close()
                finally:
                    browser.close()
        report['success'] = True
        print('PASS: exact deployed UI assets + four public home/mode/Flow browser journeys', flush=True)
    finally:
        (OUT / 'evidence.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
