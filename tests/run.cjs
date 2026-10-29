// 시나리오 테스트: node tests/run.cjs [이름필터]
// 배치 04(P0-01·02·08·09·10) 수정이 실제로 동작하는지 모의 Firebase 위에서 확인합니다.
'use strict';
const { launch, openApp, lastToast, pause } = require('./lib/harness.cjs');

const FILTER = process.argv[2] ? new RegExp(process.argv[2]) : null;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const dump = (page, path) => page.evaluate(p => window.__mock.dump(p), path);
const ok = async page => { await page.click('.app-modal-ok'); await pause(page, 500); };
// 녹음 스트림을 기록해 마이크가 꺼졌는지 확인합니다.
const trackStreams = page => page.addInitScript(() => {
  window.__streams = [];
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { const s = await orig(c); window.__streams.push(s); return s; };
});
async function openAs(browser, file, user, opts = {}) {
  const r = await openApp(browser, { file, user, rules: opts.rules || 'proposed', viewport: opts.viewport || { width: 1280, height: 900 } });
  await pause(r.page, 600);
  return r;
}

test('B01 출석: 변경 없이 저장하면 아무것도 쓰지 않고, 한 명만 바꾸면 그 학생만 저장', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="attendance"]'); await pause(page, 500);
  await page.selectOption('#quick-session', 'w1'); await pause(page, 600);
  assert(await page.$eval('#quick-save', el => el.disabled), '변경이 없는데 저장 버튼이 활성화됨');
  await page.evaluate(() => window.__mock.clearWrites());
  await page.click('[data-quick-row="s2"] [data-set="absent"]');
  await page.click('#quick-save'); await ok(page);
  const writes = await page.evaluate(() => window.__mock.writes().filter(w => w.source === 'local'));
  assert(writes.length === 1 && writes[0].path === 'classes/c1/weeks/w1/attendance/s2', '쓰기 기록: ' + JSON.stringify(writes));
  assert((await dump(page, 'classes/c1/weeks/w1/attendance/s3')).status === 'excused', '다른 학생(인정결석) 기록이 바뀜');
  assert((await dump(page, 'classes/c1/weeks/w1/attendance/s2')).status === 'absent', '바꾼 학생이 저장되지 않음');
});

test('B01b 출석: 이전 형식 지각은 출석으로 표시되고 그대로 보존', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="attendance"]'); await pause(page, 500);
  await page.selectOption('#quick-session', 'w2'); await pause(page, 600);
  const pressed = await page.$eval('[data-quick-row="s2"] [data-set="present"]', el => el.getAttribute('aria-pressed'));
  assert(pressed === 'true', '지각 기록이 출석으로 표시되지 않음');
  await page.click('[data-quick-row="s2"] [data-set="present"]'); // 미입력으로 되돌림
  await page.click('[data-quick-row="s2"] [data-set="present"]'); // 다시 출석
  assert(await page.$eval('#quick-save', el => el.disabled), '원래 값으로 돌아왔는데 저장 버튼이 활성화됨');
  assert((await dump(page, 'classes/c1/weeks/w2/attendance/s2')).status === 'late', '기존 기록이 바뀜');
});

test('B01c 출석: 미입력 학생만 일괄 불참 처리', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="attendance"]'); await pause(page, 500);
  await page.selectOption('#quick-session', 'w4'); await pause(page, 600);
  await page.click('#quick-all-absent'); await pause(page, 200);
  await page.click('#quick-save'); await ok(page);
  assert((await dump(page, 'classes/c1/weeks/w4/attendance/s2')).status === 'absent', '미입력 학생이 불참으로 저장되지 않음');
  assert((await dump(page, 'classes/c1/weeks/w4/attendance/s1')).status === 'present', '이미 출석한 학생이 바뀜');
});

test('B02 강사 음성 초안: 1차시에 고른 음성이 2차시 피드백에 붙지 않음', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  await page.setInputFiles('[data-feedback-media] [data-audio-input]', { name: 'week1-audio.webm', mimeType: 'audio/webm', buffer: Buffer.from('fake-audio-week1') });
  await pause(page, 200);
  assert((await page.textContent('[data-feedback-target]')).includes('1차시'), '대상 표시가 없음');
  await page.selectOption('#admin-week-picker', 'w2'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  assert(!(await page.textContent('[data-feedback-target]')).trim(), '2차시 화면에 1차시 음성이 표시됨');
  await page.fill('[data-feedback-text]', '2차시 텍스트 피드백입니다.');
  await page.click('[data-feedback-save]'); await pause(page, 800);
  const uploads = await page.evaluate(() => window.__mock.uploads());
  assert(uploads.length === 0, '텍스트만 등록했는데 음성이 업로드됨: ' + JSON.stringify(uploads));
  const fb = (await dump(page, 'classes/c1/weeks/w2/submissions/s1')).feedbacks.at(-1);
  assert(fb.text.includes('2차시') && !fb.audioPath, '2차시 피드백 내용 이상: ' + JSON.stringify(fb));
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  assert((await page.textContent('[data-feedback-target]')).includes('week1-audio.webm'), '1차시로 돌아왔을 때 보관된 음성 초안이 보이지 않음');
});

test('B02b 강사 녹음 중 다른 학생 선택: 녹음이 멈추고 초안은 원래 학생에게만', async b => {
  const r = await openApp(b, { file: 'admin.html', user: 'admin1', rules: 'proposed' });
  const page = r.page;
  await trackStreams(page); await page.reload(); await pause(page, 700);
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  await page.click('[data-feedback-media] [data-record-start]'); await pause(page, 1300);
  await page.click('[data-feedback-uid="s3"]'); await pause(page, 600);
  const ended = await page.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  assert(ended, '다른 학생을 골랐는데 마이크가 켜져 있음');
  assert(!(await page.textContent('[data-feedback-target]')).trim(), '다른 학생 화면에 초안이 표시됨');
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  assert((await page.textContent('[data-feedback-target]')).includes('첨부할 음성'), '원래 학생에게 녹음 초안이 남지 않음');
});

test('B03 학생 녹음 중 탭 이동: 녹음 중지·마이크 종료·다른 차시 미첨부', async b => {
  const r = await openApp(b, { file: 'index.html', user: 's1', rules: 'proposed', viewport: { width: 390, height: 844 } });
  const page = r.page;
  await trackStreams(page); await page.reload(); await pause(page, 700);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 600);
  await page.click('#student-audio-ui [data-record-start]'); await pause(page, 1300);
  await page.click('[data-tab="quiz"]'); await pause(page, 600);
  assert(await page.evaluate(() => window.__streams.length > 0 && window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), '탭을 옮겼는데 마이크가 켜져 있음');
  assert((await lastToast(page)).includes('녹음을 멈췄어요'), '녹음 중지 안내가 없음');
  await page.click('[data-tab="assignment"]'); await pause(page, 600);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 600);
  assert(await page.$eval('#student-audio-ui [data-media-draft]', el => !el.classList.contains('hide')), '4차시로 돌아왔을 때 녹음 초안이 보이지 않음');
  await page.selectOption('#student-week-picker', 'w3'); await pause(page, 600);
  await page.fill('#assignment-text', 'Estoy bien, gracias.');
  await page.click('#submit-assignment'); await pause(page, 800);
  const uploads = await page.evaluate(() => window.__mock.uploads());
  assert(uploads.length === 0, '3차시 제출에 4차시 녹음이 첨부됨: ' + JSON.stringify(uploads));
});

test('B04 반 이동 학생 재등록: 활성 반은 1개만', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c2"]'); await pause(page, 900);
  await page.click('[data-status-uid="s3"]'); await pause(page, 300);
  await ok(page); await pause(page, 600);
  const c1 = await dump(page, 'enrollments/s3_c1'), c2 = await dump(page, 'enrollments/s3_c2');
  assert(c2.status === 'active' && c1.status === 'transferred', `s3_c1=${c1.status}, s3_c2=${c2.status}`);
  assert((await dump(page, 'users/s3')).assignedClassId === 'c2', 'assignedClassId가 갱신되지 않음');
});

test('B04b 반 이동(강사가 새 반 등록 생성) — 현재 규칙에서는 친절한 오류, 수정 규칙에서는 성공', async b => {
  for (const rules of ['current', 'proposed']) {
    const { page } = await openAs(b, 'admin.html', 'admin1', { rules });
    await page.click('[data-page="classes"]'); await pause(page, 400);
    await page.click('[data-open-roster="c1"]'); await pause(page, 900);
    await page.click('[data-move-student="s1"]'); await pause(page, 300);
    await page.selectOption('.app-modal-input', 'c2'); await ok(page); await ok(page); await pause(page, 600);
    const e = await dump(page, 'enrollments/s1_c2');
    if (rules === 'current') assert(!e && (await lastToast(page)).includes('권한'), '현재 규칙에서 안내 없이 실패/성공: ' + JSON.stringify(e));
    else assert(e?.status === 'active' && (await dump(page, 'enrollments/s1_c1')).status === 'transferred', '수정 규칙에서 반 이동 실패');
    await page.context().close();
  }
});

test('B05 수강 중지 학생·종료된 반 학생: 새 코드 입력 화면이 보이고 오류 화면이 아님', async b => {
  for (const uid of ['s4', 's5']) {
    const { page, context } = await openAs(b, 'index.html', uid, { viewport: { width: 390, height: 844 } });
    assert(await page.$('#join-form'), uid + ': 입장 폼이 없음');
    assert(!(await page.innerText('#root')).includes('불러오기 실패'), uid + ': 오류 화면이 표시됨');
    await context.close();
  }
});

test('B05b 같은 반 재입장은 막고, 종료된 반 학생은 새 반에 입장(수정 규칙)', async b => {
  let r = await openAs(b, 'index.html', 's4', { viewport: { width: 390, height: 844 } });
  await r.page.fill('#join-code', 'HOLA2026'); await r.page.click('#join-form button[type="submit"]'); await pause(r.page, 700);
  assert((await lastToast(r.page)).includes('이전에 등록한 기록'), '같은 반 재입장 안내가 없음: ' + await lastToast(r.page));
  await r.context.close();
  for (const rules of ['current', 'proposed']) {
    r = await openAs(b, 'index.html', 's5', { rules, viewport: { width: 390, height: 844 } });
    await r.page.fill('#join-code', 'HOLA2026'); await r.page.click('#join-form button[type="submit"]'); await pause(r.page, 1200);
    const e = await dump(r.page, 'enrollments/s5_c1');
    if (rules === 'current') assert(!e && (await lastToast(r.page)).includes('선생님께 문의'), '현재 규칙: 안내가 없음 ' + await lastToast(r.page));
    else {
      assert(e?.status === 'active', '수정 규칙: 새 반 입장 실패');
      assert((await dump(r.page, 'users/s5')).assignedClassId === 'c1', '수정 규칙: assignedClassId 미갱신');
      assert(await r.page.$('#student-week-picker'), '입장 후 학습 화면이 보이지 않음');
    }
    await r.context.close();
  }
});

test('B05c 이전 데이터에 활성 반이 2개면 가장 최근 반을 보여 주고 강사에게 경고', async b => {
  let r = await openAs(b, 'index.html', 's3', { viewport: { width: 390, height: 844 } });
  await r.page.evaluate(() => window.__mock.remoteWrite('enrollments/s3_c2', { status: 'active' }));
  await r.page.reload(); await pause(r.page, 900);
  await r.page.evaluate(() => window.__mock.remoteWrite('enrollments/s3_c2', { status: 'active' }));
  await pause(r.page, 600);
  const options = await r.page.$$eval('#student-week-picker option', os => os.map(o => o.textContent));
  assert(options.some(t => t.includes('estar')), '가장 최근 반(기초반)이 아님: ' + options.join('|'));
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(() => window.__mock.remoteWrite('enrollments/s3_c2', { status: 'active' }));
  await r.page.click('[data-page="classes"]'); await pause(r.page, 400);
  await r.page.click('[data-open-roster="c1"]'); await pause(r.page, 900);
  assert(await r.page.$('[data-keep-class="s3"]'), '활성 반 중복 경고가 없음');
});

test('B06 로그아웃: 구독 0개, 오류 토스트 없음 (강사·학생)', async b => {
  for (const [file, user, sel] of [['admin.html', 'admin1', '#admin-logout'], ['index.html', 's1', '#student-logout']]) {
    const { page, context } = await openAs(b, file, user);
    if (file === 'admin.html') { await page.click('[data-page="feedback"]'); await pause(page, 600); }
    await page.click(sel); await pause(page, 800);
    const n = await page.evaluate(() => window.__mock.listenerCount());
    const toastBad = await page.evaluate(() => document.querySelector('#toast')?.classList.contains('bad'));
    assert(n === 0, `${file}: 로그아웃 후 구독 ${n}개 남음`);
    assert(!toastBad, `${file}: 로그아웃 후 오류 토스트: ` + await lastToast(page));
    await context.close();
  }
});

test('B07 학생 퀴즈 진행 중 강사가 다른 차시 저장: 진행 유지 + 안내 띠', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.click('.answer-option >> nth=0'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option >> nth=1'); await pause(page, 200);
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w3', { label: '3차시 · estar 동사(수정)' }));
  await pause(page, 700);
  assert((await page.textContent('.question-count')).includes('2 /'), '퀴즈 진행이 초기화됨');
  assert(await page.$('.live-notice'), '안내 띠가 없음');
  assert(await page.$('.answer-option.selected'), '고른 답이 사라짐');
});

test('B07b 강사 피드백 작성 중 새 제출 도착: 입력 유지 + 안내 띠', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s2"]'); await pause(page, 400);
  await page.fill('[data-feedback-text]', '작성 중인 피드백');
  await page.click('h1'); // 입력칸 밖을 클릭
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s1', { text: '새로 고친 답안', submittedAt: window.__mock.ts(Date.now()) }));
  await pause(page, 800);
  assert((await page.inputValue('[data-feedback-text]')) === '작성 중인 피드백', '작성 중인 피드백이 사라짐');
  assert(await page.$('.live-notice'), '안내 띠가 없음');
});

test('B07c 강사가 내용 변경 없이 저장해도 학생 화면을 다시 그리지 않음', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.evaluate(() => document.querySelector('#assignment-text')?.setAttribute('data-marker', 'kept'));
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w4', { updatedAt: window.__mock.ts(Date.now()) }));
  await pause(page, 700);
  assert(await page.$('#assignment-text[data-marker="kept"]'), '변경 없는 저장에 화면이 다시 그려짐');
});

test('기본: 학생 과제 텍스트 제출, 퀴즈 3/3, 강사 화면 주요 메뉴 오류 없음', async b => {
  const r = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await r.page.selectOption('#student-week-picker', 'w4'); await pause(r.page, 700);
  await r.page.fill('#assignment-text', 'Mi hermano tiene veinte años.');
  await r.page.click('#submit-assignment'); await pause(r.page, 900);
  assert((await dump(r.page, 'classes/c1/weeks/w4/submissions/s2'))?.text?.includes('veinte'), '과제 제출 실패');
  await r.page.click('[data-tab="quiz"]'); await pause(r.page, 500);
  await r.page.selectOption('#student-week-picker', 'w4'); await pause(r.page, 700);
  for (const pick of ['20살', 'O', 'quince']) {
    await r.page.click(`.answer-option:has-text("${pick}")`); await pause(r.page, 150);
    await r.page.click('#quiz-next'); await pause(r.page, 300);
  }
  await pause(r.page, 700);
  const res = await dump(r.page, 'classes/c1/weeks/w4/quizResults/s2');
  assert(res?.score === 3 && res.total === 3, '퀴즈 채점 이상: ' + JSON.stringify(res));
  const real = r.errors.filter(e => !/Failed to load resource/.test(e));
  assert(!real.length, '학생 화면 오류: ' + real.join(' | '));
  await r.context.close();
  const a = await openAs(b, 'admin.html', 'admin1');
  for (const p of ['classes', 'weeks', 'feedback', 'questions', 'attendance', 'overview']) { await a.page.click(`[data-page="${p}"]`); await pause(a.page, 600); }
  const realA = a.errors.filter(e => !/Failed to load resource/.test(e));
  assert(!realA.length, '강사 화면 오류: ' + realA.join(' | '));
});

(async () => {
  const browser = await launch();
  let pass = 0, fail = 0;
  for (const t of tests) {
    if (FILTER && !FILTER.test(t.name)) continue;
    const ctxBefore = browser.contexts().length;
    try { await t.fn(browser); console.log('✓', t.name); pass++; }
    catch (e) { console.log('✗', t.name, '\n   →', e.message.split('\n')[0]); fail++; }
    for (const c of browser.contexts().slice(ctxBefore)) await c.close().catch(() => {});
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
