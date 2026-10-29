// 반응형 스크린샷: node tests/screens.cjs [출력폴더] [폭,폭,...]
'use strict';
const path = require('path');
const fs = require('fs');
const { launch, openApp, pause } = require('./lib/harness.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots', new Date().toISOString().slice(0, 10)));
const WIDTHS = (process.argv[3] || '390,1440').split(',').map(Number);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const click = async (page, sel) => { await page.click(sel); await pause(page, 450); };
const scenes = [
  ['student-login', 'index.html', null, async () => {}],
  ['student-join', 'index.html', 's6', async () => {}],
  ['student-assignment', 'index.html', 's1', async p => { await p.selectOption('#student-week-picker', 'w1'); await pause(p, 600); }],
  ['student-quiz', 'index.html', 's2', async p => { await click(p, '[data-tab="quiz"]'); await p.selectOption('#student-week-picker', 'w4'); await pause(p, 600); await p.click('.answer-option >> nth=1'); await pause(p, 200); }],
  ['student-quiz-result', 'index.html', 's2', async p => { await click(p, '[data-tab="quiz"]'); await p.selectOption('#student-week-picker', 'w4'); await pause(p, 600); for (let i = 0; i < 3; i++) { await p.click('.answer-option >> nth=1'); await p.click('#quiz-next'); await pause(p, 250); } await pause(p, 600); }],
  ['student-preview', 'index.html', 's1', async p => { if (await p.$('[data-tab="preview"]')) await click(p, '[data-tab="preview"]'); }],
  ['student-questions', 'index.html', 's1', async p => { await click(p, '[data-tab="questions"]'); const q = await p.$('[data-qid]'); if (q) { await q.click(); await pause(p, 400); } }],
  ['student-mypage', 'index.html', 's1', async p => click(p, '[data-tab="mypage"]')],
  ['student-returning', 'index.html', 's5', async () => {}],
  ['admin-login', 'admin.html', null, async () => {}],
  ['admin-dashboard', 'admin.html', 'admin1', async p => pause(p, 600)],
  ['admin-modal', 'admin.html', 'admin1', async p => { await click(p, '[data-page="classes"]'); await click(p, '#create-class'); }],
  ['admin-classes', 'admin.html', 'admin1', async p => click(p, '[data-page="classes"]')],
  ['admin-students', 'admin.html', 'admin1', async p => { await click(p, '[data-page="classes"]'); await click(p, '[data-open-roster="c1"]'); }],
  ['admin-weeks', 'admin.html', 'admin1', async p => click(p, '[data-page="weeks"]')],
  ['admin-weeks-quiz', 'admin.html', 'admin1', async p => { await click(p, '[data-page="weeks"]'); const w = await p.$('[data-week-open="w1"]'); if (w) await click(p, '[data-week-open="w1"]'); await click(p, '[data-week-tab="quiz"]'); }],
  ['admin-feedback', 'admin.html', 'admin1', async p => { await click(p, '[data-page="feedback"]'); await p.selectOption('#admin-week-picker', 'w1').catch(() => {}); await pause(p, 500); const s = await p.$('[data-feedback-uid="s1"]'); if (s) await click(p, '[data-feedback-uid="s1"]'); }],
  ['admin-questions', 'admin.html', 'admin1', async p => { await click(p, '[data-page="questions"]'); const q = await p.$('[data-admin-qid]'); if (q) { await q.click(); await pause(p, 400); } }],
  ['admin-attendance', 'admin.html', 'admin1', async p => { await click(p, '[data-page="attendance"]'); await p.selectOption('#quick-session', 'w2').catch(() => {}); await pause(p, 500); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [name, file, user, act] of scenes) {
    if (ONLY && !ONLY.test(name)) continue;
    for (const width of WIDTHS) {
      const { context, page, errors } = await openApp(browser, { file, user, viewport: { width, height: width < 700 ? 844 : 900 } });
      try { await pause(page, 500); await act(page); await pause(page, 400); }
      catch (e) { problems.push(`${name}@${width}: ${e.message.split('\n')[0]}`); }
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
      const real = errors.filter(e => !/net::ERR_FAILED|Failed to load resource/.test(e));
      if (real.length) problems.push(`${name}@${width}: ${real.join(' | ').slice(0, 300)}`);
      await context.close();
    }
  }
  await browser.close();
  console.log('saved to', OUT);
  if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
})();
