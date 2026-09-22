"""Real SDK + real browser persistence against hermetic auth/PostgREST fixtures.

No real Google credentials or live user records are used. Provider consent itself
is not certified here; OAuth callback consumption, refresh, restart, isolation,
IDB recovery, cloud retries, typing feedback and scroll stability are exercised.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from tempfile import TemporaryDirectory
from urllib.parse import urlparse, parse_qs, urlencode
import base64
import copy
import json
import os
import time
import traceback
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'browser-artifacts' / 'account-reliability'
AUTH_KEY = 'sb-hycegznamzjhwinegaai-auth-token'
API = 'https://hycegznamzjhwinegaai.supabase.co'
A = '10000000-0000-4000-8000-000000000001'
B = '10000000-0000-4000-8000-000000000002'
SEED = """(() => {
  // Playwright also runs init scripts in opaque about:blank documents.
  // Seed onboarding only for the actual HTTP app, never that empty document.
  if (!/^https?:$/.test(location.protocol)) return;
  for (const [id, v] of Object.entries({general:3,campaign:2,typing:1,endless:1,boss:1,leaderboards:1}))
    localStorage.setItem(`wordstrike.onboarding.${id}.v${v}`, 'seen');
})();"""


def token(uid, expires=None):
    def enc(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
    return enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({
        'sub': uid, 'aud': 'authenticated', 'role': 'authenticated',
        'iss': API + '/auth/v1', 'iat': int(time.time()),
        'exp': expires or int(time.time()) + 3600,
        'session_id': '30000000-0000-4000-8000-000000000003',
    }) + '.hermetic-test-signature'


def subject(value):
    try:
        payload = value.removeprefix('Bearer ').split('.')[1]
        return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
    except (ValueError, KeyError, IndexError):
        return None


def user(uid):
    return {'id': uid, 'aud': 'authenticated', 'role': 'authenticated',
            'email': f'fixture-{uid[-1]}@example.invalid', 'app_metadata': {'provider': 'google', 'providers': ['google']},
            'user_metadata': {'full_name': 'Fixture Player'}, 'created_at': '2026-01-01T00:00:00Z'}


def session(uid):
    return {'access_token': token(uid), 'refresh_token': 'fixture-refresh-' + uid,
            'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'user': user(uid)}


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class Backend:
    def __init__(self, base):
        self.base = base
        self.rows = {}
        self.offline = False
        self.refreshes = 0
        self.writes = 0

    def route(self, route):
        request = route.request
        if request.url.startswith(self.base):
            return route.continue_()
        if not request.url.startswith(API):
            return route.abort()
        if self.offline:
            return route.abort()
        headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'content-type': 'application/json'}
        def reply(body, status=200):
            route.fulfill(status=status, headers=headers, body=json.dumps(body))
        if request.method == 'OPTIONS':
            return reply({})
        url = urlparse(request.url)
        uid = subject(request.headers.get('authorization', ''))
        body = request.post_data_json if request.post_data else {}
        if url.path.endswith('/auth/v1/token'):
            self.refreshes += 1
            owner = body.get('refresh_token', '').removeprefix('fixture-refresh-')
            return reply(session(owner)) if owner in [A, B] else reply({'error': 'invalid_grant'}, 400)
        if url.path.endswith('/auth/v1/user'):
            return reply(user(uid)) if uid in [A, B] else reply({'message': 'Unauthorized'}, 401)
        if url.path.endswith('/auth/v1/logout'):
            return route.fulfill(status=204, headers=headers)
        if url.path.endswith('/rest/v1/wordstrike_player_profiles'):
            query = parse_qs(url.query)
            owner = query.get('user_id', ['eq.' + body.get('user_id', '')])[0].removeprefix('eq.')
            if uid not in [A, B] or owner != uid:
                return reply({'code': '42501', 'message': 'denied'}, 403)
            old = self.rows.get(owner)
            if request.method == 'GET':
                return reply([copy.deepcopy(old)] if old else [])
            if request.method == 'POST':
                if old:
                    return reply({'code': '23505'}, 409)
                self.rows[owner] = copy.deepcopy(body)
            elif request.method == 'PATCH':
                revision = int(query.get('revision', ['eq.0'])[0].removeprefix('eq.'))
                if not old or old['revision'] != revision:
                    return reply([])
                self.rows[owner].update(copy.deepcopy(body))
            else:
                return reply({'message': 'Unsupported method'}, 405)
            self.writes += 1
            return reply([{'revision': self.rows[owner]['revision']}])
        if '/functions/v1/' in url.path:
            if url.path.endswith('/leaderboard-profile'):
                return reply({'ok': True, 'data': {'profile': {'username': 'Pilot' + (uid or '')[-1], 'usernameChangedAt': None, 'canChangeAt': None}}})
            return reply({'ok': True, 'data': {'entries': [], 'rows': [], 'rank': None, 'accepted': True}})
        return reply({'message': 'Unmocked request: ' + url.path}, 404)


def setup(context, backend, errors):
    context.add_init_script(SEED)
    context.route('**/*', backend.route)
    context.on('page', lambda page: page.on('pageerror', lambda e: errors.append({'message': str(e), 'url': page.url, 'stack': e.stack})))
    page = context.pages[0] if context.pages else context.new_page()
    page.on('pageerror', lambda e: errors.append({'message': str(e), 'url': page.url, 'stack': e.stack}))
    return page


def ready(page, base, suffix=''):
    page.goto(base + suffix)
    page.wait_for_function("typeof document.querySelector('[data-action=modes]')?.onclick === 'function'", timeout=20000)
    page.evaluate("async()=>{window.__testState=(await import('./js/state.js')).appState; window.__testStore=(await import('./js/playerPersistence.js')).getPlayerPersistence();window.__testAuth=await import('./js/authService.js');}")


def owner(page, uid):
    page.wait_for_function('id => window.__testStore?.getOwner() === id && window.__testAuth?.getAuthState().user?.id === id', arg=uid, timeout=20000)


def sign_in(page, uid):
    value = session(uid)
    page.evaluate("async value => { const {getSupabaseClient}=await import('./js/supabaseClient.js'); const {error}=await getSupabaseClient().auth.setSession(value); if(error) throw error; }", value)
    owner(page, uid)


def open_mode(page, name):
    page.locator('[data-action="modes"]').first.click()
    page.locator(f'[data-mode-id="{name}"]').click()


def assert_scroll(page, name, checks):
    page.set_viewport_size({'width': 1060, 'height': 480})
    page.mouse.move(300, 260)
    snapshot = page.evaluate("""() => {
      const candidates=[document.scrollingElement,...document.querySelectorAll('#app, #app *')].filter(el=>el && el.scrollHeight-el.clientHeight>160 && (el===document.scrollingElement || /auto|scroll/.test(getComputedStyle(el).overflowY)));
      const el=candidates.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0];
      if(!el) return null;
      let selector=el===document.scrollingElement ? 'document' : el.id ? '#'+CSS.escape(el.id) : [...el.classList].map(c=>'.'+CSS.escape(c)).find(s=>document.querySelectorAll(s).length===1);
      if(!selector) throw Error('No stable scroll selector');
      el.scrollTop=Math.min(500,el.scrollHeight-el.clientHeight);
      return {selector,top:el.scrollTop};
    }""")
    assert snapshot and snapshot['top'] > 100, (name, snapshot)
    page.evaluate("async()=>{const p=await import('./js/leaderboardProfileService.js');await p.initializeLeaderboardProfile(window.__testAuth.getAuthState().user,{force:true});}")
    page.wait_for_timeout(750)
    after = page.evaluate("s => (s==='document'?document.scrollingElement:document.querySelector(s))?.scrollTop", snapshot['selector'])
    assert after is not None and abs(after-snapshot['top']) <= 4, (name, snapshot, after)
    checks.append(name + ' retains scroll across profile updates and stationary hover')
    page.screenshot(path=str(OUT / (name + '-scroll.png')), full_page=True)
    page.set_viewport_size({'width': 1280, 'height': 720})


def typing_feedback(page, name, checks):
    expect(page.locator('.word-position').first).to_be_visible(timeout=15000)
    text = page.locator('.word-position .word-text').first.inner_text()
    assert len(text) >= 3, text
    page.keyboard.type(text[:2], delay=10)
    active = page.locator('.word-visual.active .typed-letter, .word-visual.candidate .typed-letter').first
    expect(active).to_have_text(text[:2], timeout=5000)
    glyph = active.locator('..').locator('.current-letter')
    expect(glyph).to_have_text(text[2])
    style = glyph.evaluate("e=>({text:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,caret:getComputedStyle(e,'::before').borderLeftWidth})")
    assert style['text'] != style['bg'] and style['bg'] not in ['transparent', 'rgba(0, 0, 0, 0)'], style
    assert float(style['caret'].replace('px','')) >= 2, style
    checks.append(name + ' real keystrokes show typed prefix, highlighted next letter and caret')
    page.screenshot(path=str(OUT / (name + '-typing.png')), full_page=True)


def certify(playwright, browser_name, base, checks):
    browser_type = getattr(playwright, browser_name)
    backend = Backend(base)
    errors = []
    with TemporaryDirectory(prefix='wordstrike-profile-') as profile:
        context = browser_type.launch_persistent_context(profile, headless=True, viewport={'width':1280,'height':720}, service_workers='block')
        page = setup(context, backend, errors)
        try:
            callback = '#' + urlencode({k:v for k,v in session(A).items() if k in ['access_token','refresh_token','expires_in','token_type']})
            ready(page, base, callback)
            owner(page, A)
            page.wait_for_function("document.querySelector('#player-save-status')?.dataset.state === 'synced'", timeout=20000)
            assert page.evaluate('(key)=>!!JSON.parse(localStorage.getItem(key))?.refresh_token', AUTH_KEY)
            ready(page, base)
            owner(page, A)
            checks.append(browser_name + ': real SDK consumes OAuth callback and restores login on reload')

            open_mode(page, 'campaign')
            page.locator('[data-level="1"]').click()
            typing_feedback(page, browser_name + '-campaign', checks)
            # End the real loop without a 30-second wait; normal completion handlers
            # still compute results, persist records and unlock the next level.
            page.evaluate("""()=>{const g=window.__testState.game;g.spawnedCount=g.config.wordCount;g.words=[];g.completedWordCount=g.config.wordCount;g.correctCharacters=250;g.correctKeystrokes=250;g.totalKeystrokes=250;g.elapsedMs=60000;g.score=4321;}""")
            page.wait_for_function("window.__testState.screen==='RESULTS'")
            assert page.evaluate("window.__testStore.getDocument().campaign.furthest") >= 2
            await_saved = "async()=>{await window.__testStore.flush();}"
            page.evaluate(await_saved)
            ready(page, base)
            open_mode(page, 'campaign')
            expect(page.locator('[data-level="2"]')).to_be_enabled()
            checks.append(browser_name + ': real Campaign completion survives reload and unlocks level 2')

            page.locator('[data-campaign-placement]').click()
            page.wait_for_function("window.__testState.screen==='SPEED_TEST_RUN'")
            result = page.evaluate("""async()=>{
              const speed=await import('./js/speedTest.js');const state=speed.getCurrentSpeedTest();let time=performance.now();const start=time;
              if(state.config.configId!=='time-60') throw Error('Wrong placement configuration');
              const key=k=>speed.handleCurrentSpeedTestKey({key:k,code:k===' '?'Space':'Key'+k.toUpperCase(),preventDefault(){},ctrlKey:false,metaKey:false,altKey:false,repeat:false},time+=8);
              for(let i=0;i<75;i++){for(const c of speed.getSpeedTestCurrentWord(state))key(c);key(' ');}
              time=start+60001;key(' ');
              return {wpm:state.result?.wpm,screen:window.__testState.screen};
            }""")
            assert result['screen'] == 'SPEED_TEST_RESULTS' and result['wpm'] > 40, result
            checks.append(browser_name + ': real 60-second placement completion produces a persistent score')
            # Tall viewport changes reproduce the reported lower-statistics screen.
            assert_scroll(page, browser_name + '-results', checks)
            page.evaluate(await_saved)
            ready(page, base)
            open_mode(page, 'campaign')
            placed = page.evaluate("async()=>{const s=await import('./js/storage.js');return {wpm:s.getCampaignBest60SecondWpm(),level:s.getCampaignResumeLevel(s.loadSave())};}")
            assert placed['wpm'] >= result['wpm'] and placed['level'] > 1, placed
            assert_scroll(page, browser_name + '-campaign', checks)

            ready(page, base)
            page.locator('[data-action="settings"]').click()
            assert_scroll(page, browser_name + '-settings', checks)
            ready(page, base)
            open_mode(page, 'endless')
            page.locator('[data-action="endless-start"]').click()
            typing_feedback(page, browser_name + '-endless', checks)
            ready(page, base)

            # An expired access token must refresh using the stored refresh token.
            page.evaluate("""({key,access})=>{const s=JSON.parse(localStorage.getItem(key));s.expires_at=1;s.expires_in=0;s.access_token=access;localStorage.setItem(key,JSON.stringify(s));}""", {'key':AUTH_KEY,'access':token(A, int(time.time())-120)})
            ready(page, base)
            owner(page, A)
            assert backend.refreshes >= 1
            checks.append(browser_name + ': expired access token refreshes without another Google sign-in')

            # Full localStorage/quota failure: IndexedDB must remain authoritative.
            backend.offline = True
            context.add_init_script("""(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('wordstrike.player-profile.v1:'))throw new DOMException('Test quota full','QuotaExceededError');return set.call(this,k,v)};})();""")
            ready(page, base)
            owner(page, A)
            page.evaluate("""async()=>{const s=await import('./js/storage.js');s.updateLevelResult(window.__testState.save,2,{grade:'A',accuracy:99,wpm:88,score:5500,maxCombo:20});await window.__testStore.flush();if(!await window.__testStore.releaseLocalMirror())throw Error('IDB backup not durable');}""")
            ready(page, base)
            owner(page, A)
            assert page.evaluate("window.__testStore.getDocument().campaign.furthest") >= 3
            assert page.evaluate("window.__testStore.getDocument().placementWpm") > 40
            checks.append(browser_name + ': offline Campaign and placement recover from IndexedDB when localStorage is full')
            backend.offline = False
            page.evaluate("window.dispatchEvent(new Event('online'))")
            page.wait_for_function("document.querySelector('#player-save-status')?.dataset.state === 'synced'", timeout=20000)
            assert backend.rows[A]['data']['campaign']['furthest'] >= 3
            checks.append(browser_name + ': offline progress uploads after reconnection')

            # Separate browser storage restores only the authenticated owner's cloud data.
            other = browser_type.launch(headless=True)
            second = other.new_context(viewport={'width':390,'height':844}, service_workers='block')
            p2 = setup(second, backend, errors)
            ready(p2, base)
            sign_in(p2, A)
            p2.wait_for_function("window.__testStore.getDocument().campaign.furthest>=3", timeout=20000)
            assert p2.evaluate("window.__testStore.getDocument().placementWpm") > 40
            sign_in(p2, B)
            assert p2.evaluate("window.__testStore.getDocument().campaign.furthest") == 1
            assert p2.evaluate("window.__testStore.getDocument().placementWpm") == 0
            p2.evaluate("async()=>await window.__testAuth.signOut()")
            p2.wait_for_function("window.__testStore.getOwner()==='guest'")
            assert p2.evaluate('(k)=>localStorage.getItem(k)', AUTH_KEY) is None
            assert p2.evaluate("window.__testStore.getDocument().campaign.furthest") == 1
            second.close(); other.close()
            checks.append(browser_name + ': fresh mobile-sized device restores cloud data; account switch and logout never leak progress')

            page.evaluate(await_saved)
            context.close()
            context = browser_type.launch_persistent_context(profile, headless=True, viewport={'width':1280,'height':720}, service_workers='block')
            page = setup(context, backend, errors)
            ready(page, base)
            owner(page, A)
            assert page.evaluate("window.__testStore.getDocument().campaign.furthest") >= 3
            assert page.evaluate("window.__testStore.getDocument().placementWpm") > 40
            checks.append(browser_name + ': browser process restart retains login, Campaign and placement')
            assert not errors, errors
        except Exception:
            try:
                page.screenshot(path=str(OUT / (browser_name + '-failure.png')), full_page=True)
                (OUT / (browser_name + '-failure.html')).write_text(page.content())
                (OUT / (browser_name + '-errors.json')).write_text(json.dumps(errors, indent=2))
            except Exception:
                pass
            raise
        finally:
            context.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    checks=[]
    report={'success':False,'checks':checks,'sha':os.getenv('GITHUB_SHA')}
    try:
        with sync_playwright() as playwright:
            for name in os.getenv('BROWSERS','chromium,firefox').split(','):
                certify(playwright,name,f'http://127.0.0.1:{server.server_port}/',checks)
        report['success']=True
        print(f'PASS: {len(checks)} account/progress/browser checks',flush=True)
    except Exception:
        report['error']=traceback.format_exc()
        print(report['error'],flush=True)
        raise
    finally:
        (OUT/'report.json').write_text(json.dumps(report,indent=2))
        server.shutdown();server.server_close()

if __name__=='__main__':
    main()
