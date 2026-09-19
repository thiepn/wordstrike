import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

// This suite uses an isolated browser profile on the real public application.
// It never clears site data, substitutes an engine, or submits online scores.
const base = process.env.PRACTICE_URL ?? 'https://thiepn.dev/wordstrike/';
const name = process.env.PRACTICE_BROWSER ?? 'chromium';
const out = path.resolve('browser-artifacts/storage-production-acceptance');
fs.mkdirSync(out, { recursive: true });
const browser = await ({ chromium, firefox, webkit }[name]).launch();
const reports = [];
const width = name === 'webkit' ? 390 : 1280;

async function rows(page, table) {
  return page.evaluate(async ({ base, table }) => {
    const { createPracticeIndexedDbStore } = await import(new URL('js/practiceLab/practiceIndexedDbStore.js', base).href);
    const store = createPracticeIndexedDbStore();
    await store.open();
    try { return await store.list(table); } finally { store.close(); }
  }, { base, table });
}
async function openLab(page) {
  await page.locator('[data-action="modes"]').click();
  await page.locator('[data-mode-id="practice"]').click();
  await page.locator('.pl-studio-home').waitFor();
}
async function remaining(page, limit = 80) {
  return page.locator('.practice-lab-screen .is-current').first().evaluate((el, limit) => {
    let text = '';
    for (let node = el; node && text.length < limit; node = node.nextElementSibling) {
      text += node.querySelector('br') ? '\n' : node.textContent;
    }
    return text.replaceAll('\u00a0', ' ').slice(0, limit);
  }, limit);
}
async function type(page, text, delay = 20) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(lines[i], { delay });
  }
}
async function fillStorage(page) {
  return page.evaluate(() => {
    localStorage.setItem('production-acceptance-preserve', 'another app must remain untouched');
    let fillers = 0;
    for (const size of [131072, 32768, 8192, 2048, 512, 128, 16, 1]) {
      for (let attempt = 0; attempt < 200; attempt++) {
        try { localStorage.setItem('production-quota-' + fillers, 'q'.repeat(size)); fillers++; }
        catch (error) { if (error.name !== 'QuotaExceededError') throw error; break; }
      }
    }
    try { localStorage.setItem('production-quota-probe', 'x'.repeat(1024)); }
    catch (error) { if (error.name === 'QuotaExceededError') return fillers; throw error; }
    throw new Error('The native localStorage quota was not reached');
  });
}

try {
  for (const scenario of ['weak-keys-b', 'full-assessment', 'daily-training']) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
    await context.addInitScript(() => {
      if (!localStorage.getItem('wordstrike.onboarding.general.v3')) localStorage.setItem('wordstrike.onboarding.general.v3', 'seen');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const record = { scenario, browser: name, width, base, releaseUnderTest: 'd67f0152370254d63d24f97097585cc186e331d1', status: 'FAIL', errors: [], failedRequests: [] };
    page.on('pageerror', error => record.errors.push(error.message));
    page.on('requestfailed', request => {
      if (request.url().includes('/js/practiceLab/') || request.url().includes('/data/practice/')) record.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
    });
    try {
      if (scenario !== 'weak-keys-b') await page.clock.install();
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      record.fillers = await fillStorage(page);
      await openLab(page);
      if (scenario === 'weak-keys-b') {
        await page.locator('[data-lab-drill="weak-keys"] button').click();
        await page.locator('[data-lab-letter="b"]').click();
        await page.locator('[data-practice-action="start-weak-keys"]:enabled').waitFor();
        record.selectedLetter = await page.locator('[data-weak-key-target]').inputValue();
        assert.equal(record.selectedLetter, 'b');
        assert.ok(!(await page.locator('.practice-lab-screen').textContent()).includes('PRACTICE_STORAGE_'), 'Recommendations still have a storage failure');
        await page.screenshot({ path: path.join(out, `${name}-weak-keys-b-ready.png`), fullPage: true });
        await page.locator('[data-practice-action="start-weak-keys"]').click();
        const capture = page.locator('[data-weak-keys-input]');
        await capture.waitFor({ state: 'visible' });
        await capture.evaluate(el => { window.__stablePracticeCapture = el; });
        const first = await remaining(page, 1);
        await type(page, first === 'x' ? 'z' : 'x');
        await page.keyboard.press('Backspace');
        assert.equal(await remaining(page, 1), first);
        record.typed = 0;
        for (let batch = 0; batch < 250; batch++) {
          if (await page.locator('[data-practice-view="weak-keys-result"]').count()) break;
          assert.equal(await page.locator('[data-practice-view="weak-keys-session-error"]').count(), 0);
          assert.ok(await capture.evaluate(el => el === window.__stablePracticeCapture && el === document.activeElement), 'Typing capture replaced or focus lost');
          const text = await remaining(page);
          assert.ok(text.length > 0);
          await type(page, text);
          record.typed += text.length;
        }
        await page.locator('[data-practice-view="weak-keys-result"]').waitFor();
        const saved = (await rows(page, 'sessionSummaries')).filter(row => row.experimentId === 'weak-keys' && row.status === 'completed');
        assert.equal(saved.length, 1);
        record.sessionIds = saved.map(row => row.sessionId);
      } else if (scenario === 'full-assessment') {
        await page.locator('[data-lab-drill="full-assessment"] button').click();
        record.depths = [];
        for (const depth of ['quick', 'standard', 'deep']) {
          await page.locator(`[data-practice-action="start-assessment"][data-assessment-depth="${depth}"]:enabled`).waitFor();
          record.depths.push(depth);
        }
        await page.screenshot({ path: path.join(out, `${name}-all-assessments-ready.png`), fullPage: true });
        await page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]').click();
        for (let block = 0; block < 3; block++) {
          await page.locator('[data-assessment-action="next"]').click();
          await page.locator('[data-assessment-input]').waitFor({ state: 'visible' });
          await type(page, await remaining(page, 100));
          await page.clock.fastForward(100000);
          await page.locator(block === 2 ? '[data-assessment-action="finish"], [role="alert"]' : '[data-assessment-action="next"], [role="alert"]').waitFor();
          assert.equal(await page.locator('.practice-lab-screen [role="alert"]').count(), 0, await page.locator('.practice-lab-screen').innerText());
        }
        await page.locator('[data-assessment-action="finish"]').click();
        await page.getByRole('heading', { name: 'Assessment results', exact: true }).waitFor();
        const runs = (await rows(page, 'assessmentRuns')).filter(row => row.status === 'completed');
        assert.equal(runs.length, 1);
        assert.equal(runs[0].blocks.filter(block => block.status === 'completed').length, 3);
        record.assessmentId = runs[0].assessmentRunId;
        record.sessionIds = (await rows(page, 'sessionSummaries')).filter(row => row.status === 'completed').map(row => row.sessionId);
        assert.equal(record.sessionIds.length, 3);
      } else {
        await page.locator('.pl-navigation [data-route="daily-training"]').click();
        await page.locator('[data-coach-minutes="5"]').click();
        await page.locator('[data-practice-action="create-coach-plan"]:enabled').click();
        await page.locator('[data-practice-action="start-coach-next"]:enabled').waitFor();
        const plan = (await rows(page, 'coachPlans'))[0];
        assert.ok(plan?.blocks.length > 0, 'An empty plan is not a usable session');
        record.planId = plan.coachPlanId;
        await page.locator('[data-practice-action="start-coach-next"]').click();
        await page.locator('[data-real-text-input]').waitFor({ state: 'visible' });
        await type(page, await remaining(page, 100), 35);
        await page.clock.fastForward(301000);
        await page.locator('[data-real-text-session-action="finish"]').click();
        await page.waitForFunction(() => document.querySelector('.practice-coach-block[data-status="completed"]'));
        const plans = await rows(page, 'coachPlans');
        assert.equal(plans.length, 1);
        assert.equal(plans[0].status, 'finished');
        record.sessionIds = (await rows(page, 'sessionSummaries')).filter(row => row.status === 'completed' && row.coachBinding?.coachPlanId === record.planId).map(row => row.sessionId);
        assert.equal(record.sessionIds.length, 1);
      }
      await page.screenshot({ path: path.join(out, `${name}-${scenario}-complete.png`), fullPage: true });
      const profilesBefore = await rows(page, 'profiles');
      assert.equal(profilesBefore.length, 1);
      record.profileId = profilesBefore[0].profileId;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openLab(page);
      const after = await rows(page, 'sessionSummaries');
      for (const id of record.sessionIds) assert.equal(after.filter(row => row.sessionId === id && row.status === 'completed').length, 1, 'Saved completion lost or duplicated after reload');
      const profiles = await rows(page, 'profiles');
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].profileId, record.profileId);
      assert.equal(await page.evaluate(() => localStorage.getItem('production-acceptance-preserve')), 'another app must remain untouched');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('production-quota-')).length), record.fillers);
      assert.deepEqual(record.errors, []);
      record.status = 'PASS';
    } catch (error) {
      record.error = String(error);
      record.body = await page.locator('body').innerText().catch(() => '');
      await page.screenshot({ path: path.join(out, `${name}-${scenario}-failure.png`), fullPage: true }).catch(() => {});
    } finally {
      reports.push(record);
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(reports, null, 2));
      console.log(JSON.stringify(record));
      await context.close();
    }
  }
} finally { await browser.close(); }
assert.equal(reports.filter(row => row.status !== 'PASS').length, 0, 'Reported broken modes failed production acceptance');
