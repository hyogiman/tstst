// 반응형 스크린샷: node tests/screens.cjs [출력폴더] [폭,폭,...]
'use strict';
const path = require('path');
const fs = require('fs');
const { launch, openApp, pause } = require('./lib/harness.cjs');
const { makeSeed } = require('./fixtures/seed.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots', new Date().toISOString().slice(0, 10)));
const WIDTHS = (process.argv[3] || '390,1440').split(',').map(Number);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const click = async (page, sel) => { await page.click(sel); await pause(page, 450); };
// 2026-10-29 공지사항 · 복습 수업 영상 장면용 데이터(장면 다섯째 칸에 넣으면 그 장면만 이 데이터로 엽니다)
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const withNotices = () => {
  const s = makeSeed(), n = (id, title, body, pinned, h) => { s.docs[`classes/c1/notices/${id}`] = { title, body, pinned, createdAt: ago(h), updatedAt: ago(h), createdBy: 'admin1', authorName: '유진' }; };
  n('n1', '교재는 3과까지 준비해 주세요', '교재: 「Hola 스페인어」 3과까지 읽어 오세요.\n서점 링크: https://example.com/book', true, 240);
  n('n2', '11월 5일 수업은 쉽니다', '보강은 11월 12일(목) 같은 시간입니다.\n줌 링크는 수업 전에 다시 올릴게요.', false, 1);
  n('n3', '단어 시험 범위 안내', '1~3차시 단어 40개', false, 120);
  s.docs['classes/c1/noticeReads/s1'] = { seenAt: ago(48) }; s.docs['classes/c1/noticeReads/s2'] = { seenAt: ago(0.5) };
  return s;
};
const withRecap = upload => () => {
  const s = makeSeed(), videos = [{ kind: 'youtube', videoId: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ', name: '유튜브 영상 (dQw4w9WgXcQ)' }];
  if (upload) videos.push({ kind: 'upload', path: 'classes/c1/recaps/w4/video/class4.mp4', name: '4차시 수업.mp4', size: 734003200 });
  s.docs['classes/c1/weeks/w4'].recap = { enabled: true, videos };
  return s;
};
const scenes = [
  ['student-login', 'index.html', null, async () => {}],
  ['student-join', 'index.html', 's6', async () => {}],
  ['student-home', 'index.html', 's1', async p => pause(p, 600)],
  ['student-assignment', 'index.html', 's1', async p => { await click(p, '[data-tab="assignment"]'); await p.selectOption('#student-week-picker', 'w1'); await pause(p, 600); }],
  ['student-assignment-edit', 'index.html', 's1', async p => { await click(p, '[data-tab="assignment"]'); await p.selectOption('#student-week-picker', 'w1'); await pause(p, 600); await click(p, '#edit-assignment'); await click(p, '[data-ask-feedback]'); }],
  ['student-quiz', 'index.html', 's2', async p => { await click(p, '[data-tab="quiz"]'); await p.selectOption('#student-week-picker', 'w4'); await pause(p, 600); await p.click('.answer-option >> nth=1'); await pause(p, 200); }],
  ['student-quiz-result', 'index.html', 's2', async p => { await click(p, '[data-tab="quiz"]'); await p.selectOption('#student-week-picker', 'w4'); await pause(p, 600); for (let i = 0; i < 3; i++) { await p.click('.answer-option >> nth=1'); await p.click('#quiz-next'); await pause(p, 250); } await pause(p, 600); }],
  ['student-quiz-summary', 'index.html', 's2', async p => { await click(p, '[data-tab="quiz"]'); await p.selectOption('#student-week-picker', 'w1'); await pause(p, 700); }],
  ['student-preview', 'index.html', 's1', async p => { if (await p.$('#home-next [data-home-go="preview"]')) await click(p, '#home-next [data-home-go="preview"]'); else if (await p.$('[data-tab="preview"]')) await click(p, '[data-tab="preview"]'); }],
  ['student-questions', 'index.html', 's1', async p => { await click(p, '[data-tab="questions"]'); const q = await p.$('[data-qid]'); if (q) { await q.click(); await pause(p, 400); } }],
  ['student-mypage', 'index.html', 's1', async p => click(p, '[data-tab="mypage"]')],
  ['student-returning', 'index.html', 's5', async () => {}],
  ['student-past-assignment', 'index.html', 's5', async p => { await click(p, '[data-past-class="c3"]'); await p.selectOption('#student-week-picker', 'ow1'); await pause(p, 600); }],
  ['student-past-preview', 'index.html', 's5', async p => { await click(p, '[data-past-class="c3"]'); await p.selectOption('#student-week-picker', 'ow1'); await pause(p, 400); await click(p, '[data-tab="preview"]'); }],
  ['admin-login', 'admin.html', null, async () => {}],
  ['admin-dashboard', 'admin.html', 'admin1', async p => pause(p, 600)],
  ['admin-dashboard-progress', 'admin.html', 'admin1', async p => { await pause(p, 600); await click(p, '[data-dash-tab="progress"]'); }],
  ['admin-dashboard-items', 'admin.html', 'admin1', async p => { await pause(p, 600); await click(p, '[data-dash-tab="items"]'); }],
  ['admin-modal', 'admin.html', 'admin1', async p => { await click(p, '[data-page="classes"]'); await click(p, '#create-class'); }],
  ['admin-classes', 'admin.html', 'admin1', async p => click(p, '[data-page="classes"]')],
  ['admin-students', 'admin.html', 'admin1', async p => { await click(p, '[data-page="classes"]'); await click(p, '[data-open-roster="c1"]'); }],
  ['admin-student-detail', 'admin.html', 'admin1', async p => { await click(p, '[data-page="classes"]'); await click(p, '[data-open-roster="c1"]'); await pause(p, 600); await click(p, '[data-open-detail="s2"]'); await pause(p, 600); }],
  ['admin-weeks', 'admin.html', 'admin1', async p => click(p, '[data-page="weeks"]')],
  ['admin-weeks-quiz', 'admin.html', 'admin1', async p => { await click(p, '[data-page="weeks"]'); const w = await p.$('[data-week-open="w1"]'); if (w) await click(p, '[data-week-open="w1"]'); await click(p, '[data-week-tab="quiz"]'); }],
  ['admin-feedback', 'admin.html', 'admin1', async p => { await click(p, '[data-page="feedback"]'); await p.selectOption('#admin-week-picker', 'w1').catch(() => {}); await pause(p, 500); const s = await p.$('[data-feedback-uid="s1"]'); if (s) await click(p, '[data-feedback-uid="s1"]'); }],
  ['admin-questions', 'admin.html', 'admin1', async p => { await click(p, '[data-page="questions"]'); const q = await p.$('[data-admin-qid]'); if (q) { await q.click(); await pause(p, 400); } }],
  ['student-home-notices', 'index.html', 's1', async p => pause(p, 600), withNotices],
  ['student-notices', 'index.html', 's1', async p => { await pause(p, 600); await click(p, '.announce-row:has-text("11월 5일")'); }, withNotices],
  ['student-quiz-recap', 'index.html', 's1', async p => { await pause(p, 600); await click(p, '.todo-row [data-view="video"]'); }, withRecap(false)],
  ['admin-notices', 'admin.html', 'admin1', async p => { await click(p, '[data-page="notices"]'); await pause(p, 500); }, withNotices],
  ['admin-notice-editor', 'admin.html', 'admin1', async p => { await click(p, '[data-page="notices"]'); await click(p, '#notice-new'); }, withNotices],
  ['admin-weeks-recap', 'admin.html', 'admin1', async p => { await click(p, '[data-page="weeks"]'); await click(p, '[data-week-open="w4"]'); await click(p, '[data-week-tab="quiz"]'); }, withRecap(true)],
  ['admin-attendance', 'admin.html', 'admin1', async p => { await click(p, '[data-page="attendance"]'); await p.selectOption('#quick-session', 'w2').catch(() => {}); await pause(p, 500); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [name, file, user, act, seedOf] of scenes) {
    if (ONLY && !ONLY.test(name)) continue;
    for (const width of WIDTHS) {
      const { context, page, errors } = await openApp(browser, { file, user, viewport: { width, height: width < 700 ? 844 : 900 }, seed: seedOf ? seedOf() : undefined });
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
