// 시나리오 테스트: node tests/run.cjs [이름필터]
// 모의 Firebase 위에서 배치별 수정이 실제로 동작하는지 확인합니다.
// 규칙 흉내: 'v1'(처음 받은 규칙) · 'v2'(2026-10-29 게시) · 'v3'(이번 수정안). 기본은 v3.
'use strict';
const { launch, openApp, lastToast, pause } = require('./lib/harness.cjs');
const { makeSeed, kstDate, DAY } = require('./fixtures/seed.cjs');

const FILTER = process.argv[2] ? new RegExp(process.argv[2]) : null;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const dump = (page, path) => page.evaluate(p => window.__mock.dump(p), path);
const ok = async page => { await page.click('.app-modal-ok'); await pause(page, 500); };
// 배치 11: 수강생 관리의 행 동작은 ⋯ 메뉴 안에 있습니다.
const rowAction = async (page, uid, attr) => { await page.click(`[data-row-menu="${uid}"]`); await pause(page, 150); await page.click(`[${attr}="${uid}"]`); };
// 녹음 스트림을 기록해 마이크가 꺼졌는지 확인합니다.
const trackStreams = page => page.addInitScript(() => {
  window.__streams = [];
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { const s = await orig(c); window.__streams.push(s); return s; };
});
// 배치 10부터 학생 첫 화면은 '홈'입니다. 과제 화면에서 시작하던 기존 시나리오는 tab: 'assignment'(학생 기본값)로 과제 탭을 먼저 엽니다.
async function openAs(browser, file, user, opts = {}) {
  const r = await openApp(browser, { file, user, rules: opts.rules || 'v3', viewport: opts.viewport || { width: 1280, height: 900 }, seed: opts.seed });
  await pause(r.page, 600);
  const tab = opts.tab ?? (file === 'index.html' ? 'assignment' : null);
  if (tab && tab !== 'home' && await r.page.$(`[data-tab="${tab}"]`)) { await r.page.click(`[data-tab="${tab}"]`); await pause(r.page, 600); }
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
  await page.click('[data-tab="assignment"]'); await pause(page, 600);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 600);
  await page.click('#student-audio-ui [data-record-start]'); await pause(page, 1300);
  await page.click('[data-tab="quiz"]'); await pause(page, 600);
  assert(await page.evaluate(() => window.__streams.length > 0 && window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), '탭을 옮겼는데 마이크가 켜져 있음');
  assert((await lastToast(page)).includes('녹음을 멈췄어요'), '녹음 중지 안내가 없음');
  await page.click('[data-tab="assignment"]'); await pause(page, 600);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 600);
  assert(await page.$eval('#student-audio-ui [data-media-draft]', el => !el.classList.contains('hide')), '4차시로 돌아왔을 때 녹음 초안이 보이지 않음');
  await page.selectOption('#student-week-picker', 'w3'); await pause(page, 600);
  await page.click('#edit-assignment'); await pause(page, 200); // 3차시는 이미 제출함 → [수정해서 다시 제출]
  await page.fill('#assignment-text', 'Estoy bien, gracias.');
  await page.click('#submit-assignment'); await pause(page, 800);
  const uploads = await page.evaluate(() => window.__mock.uploads());
  assert(uploads.length === 0, '3차시 제출에 4차시 녹음이 첨부됨: ' + JSON.stringify(uploads));
});

test('B04 반 이동 학생 재등록: 활성 반은 1개만', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c2"]'); await pause(page, 900);
  await rowAction(page, 's3', 'data-status-uid'); await pause(page, 300);
  await ok(page); await pause(page, 600);
  const c1 = await dump(page, 'enrollments/s3_c1'), c2 = await dump(page, 'enrollments/s3_c2');
  assert(c2.status === 'active' && c1.status === 'transferred', `s3_c1=${c1.status}, s3_c2=${c2.status}`);
  assert((await dump(page, 'users/s3')).assignedClassId === 'c2', 'assignedClassId가 갱신되지 않음');
});

test('B04b 반 이동(강사가 새 반 등록 + 수강 기간 기록) — 이전 규칙에서는 친절한 오류, v3 규칙에서는 성공', async b => {
  for (const rules of ['v1', 'v2', 'v3']) {
    const { page } = await openAs(b, 'admin.html', 'admin1', { rules });
    await page.click('[data-page="classes"]'); await pause(page, 400);
    await page.click('[data-open-roster="c1"]'); await pause(page, 900);
    await rowAction(page, 's1', 'data-move-student'); await pause(page, 300);
    await page.selectOption('.app-modal-input', 'c2'); await ok(page); await ok(page); await pause(page, 600);
    const e = await dump(page, 'enrollments/s1_c2');
    if (rules !== 'v3') assert(!e && (await lastToast(page)).includes('firestore.rules'), rules + ' 규칙에서 안내 없이 실패/성공: ' + JSON.stringify(e) + ' ' + await lastToast(page));
    else {
      assert(e?.status === 'active' && (await dump(page, 'enrollments/s1_c1')).status === 'transferred', 'v3 규칙에서 반 이동 실패');
      const events = await page.evaluate(() => window.__mock.list('enrollments/s1_c').filter(p => p.includes('/events/')).map(p => p.split('/')[1] + ':' + window.__mock.dump(p).type));
      assert(events.includes('s1_c1:transferred_out') && events.includes('s1_c2:transferred_in'), '수강 기간 기록: ' + events.join(','));
    }
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

test('B05b 같은 반 재입장은 막고, 종료된 반 학생은 새 반에 입장(v2 이후 규칙)', async b => {
  let r = await openAs(b, 'index.html', 's4', { viewport: { width: 390, height: 844 } });
  await r.page.fill('#join-code', 'HOLA2026'); await r.page.click('#join-form button[type="submit"]'); await pause(r.page, 700);
  assert((await lastToast(r.page)).includes('이전에 등록한 기록'), '같은 반 재입장 안내가 없음: ' + await lastToast(r.page));
  await r.context.close();
  for (const rules of ['v1', 'v2']) {
    r = await openAs(b, 'index.html', 's5', { rules, viewport: { width: 390, height: 844 } });
    await r.page.fill('#join-code', 'HOLA2026'); await r.page.click('#join-form button[type="submit"]'); await pause(r.page, 1200);
    const e = await dump(r.page, 'enrollments/s5_c1');
    if (rules === 'v1') assert(!e && (await lastToast(r.page)).includes('선생님께 문의'), 'v1 규칙: 안내가 없음 ' + await lastToast(r.page));
    else {
      assert(e?.status === 'active', 'v2 규칙: 새 반 입장 실패');
      assert((await dump(r.page, 'users/s5')).assignedClassId === 'c1', 'v2 규칙: assignedClassId 미갱신');
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

// ---------- 보관된 반: 강의 영상만 막고 나머지 지난 자료는 읽기 전용으로 (2026-10-29 요청) ----------
test('F01 보관된 반 학생: 지난 반 자료를 읽기 전용으로 열람, 영상은 요청조차 하지 않음 (v3)', async b => {
  const { page } = await openAs(b, 'index.html', 's5', { viewport: { width: 390, height: 844 } });
  assert(await page.$('#join-form'), '입장 폼이 없음');
  assert((await page.innerText('.past-classes')).includes('왕초보반 1기'), '지난 반 목록이 없음');
  await page.click('[data-past-class="c3"]'); await pause(page, 700);
  assert((await page.innerText('.past-banner')).includes('강의 영상은 볼 수 없어요'), '지난 반 안내 띠가 없음');
  assert(!(await page.$('[data-tab="classmates"]')), '지난 반에서 우리 반 탭이 보임');
  await page.selectOption('#student-week-picker', 'ow1'); await pause(page, 600);
  // 과제: 제출한 답안과 피드백이 보이고 제출 버튼은 없음
  const assignment = await page.innerText('#student-body');
  assert(assignment.includes('A, B, C, D, E') && assignment.includes('ñ 발음'), '제출 답안·피드백이 보이지 않음');
  assert(!(await page.$('#submit-assignment')), '지난 반에 제출 버튼이 있음');
  // 예습 자료: 글·첨부는 보이고 영상은 안내만
  await page.click('[data-tab="preview"]'); await pause(page, 600);
  assert(!(await page.$('video')), '지난 반에 영상 플레이어가 그려짐');
  assert((await page.innerText('#student-body')).includes('수강 기간에만 볼 수 있어요'), '영상 안내 문구가 없음');
  assert(await page.$('a[data-media-path$="abc.pdf"]'), '첨부 자료가 보이지 않음');
  // 복습: 연습 모드, 저장하지 않음
  await page.evaluate(() => window.__mock.clearWrites());
  await page.click('[data-tab="quiz"]'); await pause(page, 600);
  await page.click('#quiz-full-retry'); await pause(page, 200);
  for (let i = 0; i < 2; i++) { await page.click('.answer-option >> nth=0'); await page.click('#quiz-next'); await pause(page, 250); }
  await pause(page, 300);
  assert((await page.innerText('#quiz-content')).includes('연습 결과는 저장되지 않아요'), '연습 모드 안내가 없음');
  const writes = await page.evaluate(() => window.__mock.writes().filter(w => w.source === 'local'));
  assert(!writes.length, '연습 모드인데 저장함: ' + JSON.stringify(writes));
  // 질문: 기록과 답변은 보이고, 새 질문·답장 입력칸은 없음
  await page.click('[data-tab="questions"]'); await pause(page, 600);
  assert(!(await page.$('#question-create')), '지난 반에 새 질문 폼이 있음');
  await page.click('[data-qid="oq1"]'); await pause(page, 500);
  assert((await page.innerText('#student-replies')).includes('예이스모'), '선생님 답변이 보이지 않음');
  assert(!(await page.$('#student-reply-form')), '지난 반에 답장 폼이 있음');
  // 출석
  await page.click('[data-tab="mypage"]'); await pause(page, 600);
  assert((await page.innerText('#attendance-overview')).includes('출석'), '지난 반 출석 기록이 없음');
  const videoRequests = (await page.evaluate(() => window.__mock.urlRequests())).filter(x => x.includes('/video/'));
  assert(!videoRequests.length, '영상 주소를 요청함: ' + videoRequests.join(','));
  // 돌아가기
  await page.click('#past-exit'); await pause(page, 700);
  assert(await page.$('#join-form') && !(await page.$('.past-banner')), '돌아가기 후 입장 화면이 아님');
});

test('F02 보관된 반: 게시 중인 v2 규칙에서는 지난 반 목록 없이 기존처럼 입장 화면 (오류 없음)', async b => {
  const { page, errors } = await openAs(b, 'index.html', 's5', { rules: 'v2', viewport: { width: 390, height: 844 } });
  assert(await page.$('#join-form'), '입장 폼이 없음');
  assert(!(await page.$('.past-classes')), 'v2 규칙에서 지난 반 목록이 보임');
  assert(!(await page.evaluate(() => document.querySelector('#toast')?.classList.contains('bad'))), '오류 토스트: ' + await lastToast(page));
  const real = errors.filter(e => !/Failed to load resource/.test(e));
  assert(!real.length, '콘솔 오류: ' + real.join(' | '));
});

test('F03 현재 반 + 지난 반 학생: 내 정보에서 지난 반을 열고 돌아오면 현재 반 그대로 (v3)', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  // 실시간 등록 구독이 지난 반 목록을 갱신합니다(새로고침하면 모의 데이터가 초기화되므로 하지 않음).
  await page.evaluate(() => window.__mock.remoteWrite('enrollments/s1_c3', { uid: 's1', classId: 'c3', studentName: '김민지', email: 'minji@example.com', joinCode: 'OLA2025', status: 'active', joinedAt: window.__mock.ts(Date.now() - 200 * 86400000) }, { merge: false }));
  await pause(page, 700);
  await page.click('[data-tab="mypage"]'); await pause(page, 600);
  assert(await page.$('[data-past-class="c3"]'), '내 정보에 지난 반이 없음');
  await page.click('[data-past-class="c3"]'); await pause(page, 700);
  assert(await page.$('.past-banner'), '지난 반 화면이 아님');
  await page.click('#past-exit'); await pause(page, 900);
  assert(!(await page.$('.past-banner')) && (await page.$('[data-tab="mypage"].active')), '내 정보로 돌아오지 않음');
  assert((await page.innerText('.info-grid')).includes('스페인어 기초반 2기'), '현재 반이 바뀜');
});

test('F04 강사: 보관된 반의 등록은 활성 반 중복으로 보지 않고, 반 이동 때도 건드리지 않음', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  // s5: 보관된 c3 수강(완료) + c1 새로 입장
  await page.evaluate(() => window.__mock.remoteWrite('enrollments/s5_c1', { uid: 's5', classId: 'c1', studentName: '정하은', email: 'haeun@example.com', joinCode: 'HOLA2026', status: 'active', joinedAt: window.__mock.ts(Date.now()) }, { merge: false }));
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c1"]'); await pause(page, 900);
  assert(!(await page.$('[data-keep-class="s5"]')), '보관된 반 등록을 중복으로 경고함');
  await rowAction(page, 's5', 'data-move-student'); await pause(page, 300);
  await page.selectOption('.app-modal-input', 'c2'); await ok(page); await ok(page); await pause(page, 600);
  assert((await dump(page, 'enrollments/s5_c2'))?.status === 'active', '반 이동 실패');
  assert((await dump(page, 'enrollments/s5_c1')).status === 'transferred', '이전 반이 반 이동 처리되지 않음');
  assert((await dump(page, 'enrollments/s5_c3')).status === 'active', '보관된 반 등록이 바뀜(지난 자료 열람 불가)');
});

// ---------- 배치 05: 소통 누락 · 표시 오류 ----------
test('B08 답변 완료된 질문에 학생이 추가 질문 → 답변 대기 (학생 쓰기 + 강사 목록)', async b => {
  let r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await r.page.click('[data-tab="questions"]'); await pause(r.page, 600);
  await r.page.click('[data-qid="q1"]'); await pause(r.page, 500);
  await r.page.fill('#student-reply-form textarea', '그럼 Encantada는 여자일 때만 쓰나요?');
  await r.page.click('#student-reply-form button[type="submit"]'); await pause(r.page, 700);
  const q = await dump(r.page, 'classes/c1/questions/q1');
  assert(q.status === 'open' && q.needsTeacherReply === true && q.lastSenderRole === 'student' && q.lastMessageAt, '질문 상태가 바뀌지 않음: ' + JSON.stringify(q));
  assert((await r.page.innerText('[data-qid="q1"]')).includes('답변 대기'), '학생 목록 배지가 답변 대기가 아님');
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(() => window.__mock.remoteWrite('classes/c1/questions/q1', { status: 'open', needsTeacherReply: true, lastSenderRole: 'student', lastMessageAt: window.__mock.ts(Date.now()) }));
  await r.page.click('[data-page="questions"]'); await pause(r.page, 700);
  assert((await r.page.innerText('#admin-question-pending')).includes('2건'), '답변 대기 개수: ' + await r.page.innerText('#admin-question-pending'));
  const first = await r.page.$eval('[data-admin-qid]', el => el.dataset.adminQid);
  assert(first === 'q1', '추가 질문이 맨 위로 오지 않음: ' + first);
  assert((await r.page.innerText('[data-admin-qid="q1"]')).includes('답변 대기'), '강사 목록 배지가 답변 대기가 아님');
});

test('B09 강사 답변 직후 열린 상세의 배지가 답변 완료, 버튼은 답변 대기로 변경', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="questions"]'); await pause(page, 700);
  await page.click('[data-admin-qid="q2"]'); await pause(page, 500);
  assert((await page.innerText('#admin-question-badge')).includes('답변 대기'), '처음 배지가 답변 대기가 아님');
  await page.fill('#admin-reply-text', 'cinco-quince-cincuenta를 소리 내어 비교해 보세요.');
  await page.click('#admin-reply-form button[type="submit"]'); await pause(page, 700);
  assert((await page.innerText('#admin-question-badge')).includes('답변 완료'), '답변 후 배지: ' + await page.innerText('#admin-question-badge'));
  assert((await page.innerText('#question-status')).includes('답변 대기로 변경'), '버튼 문구: ' + await page.innerText('#question-status'));
  const q = await dump(page, 'classes/c1/questions/q2');
  assert(q.status === 'answered' && q.needsTeacherReply === false && q.lastSenderRole === 'admin', '저장 상태: ' + JSON.stringify(q));
  await page.click('#question-status'); await pause(page, 500);
  assert((await page.innerText('#admin-question-badge')).includes('답변 대기'), '답변 대기로 변경 후 배지가 그대로');
  assert((await dump(page, 'classes/c1/questions/q2')).needsTeacherReply === true, '답변 대기로 변경이 저장되지 않음');
});

test('B10 피드백 받은 학생이 재제출 → 2차 제출 기록, 강사 목록 재검토 대기', async b => {
  let r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await r.page.selectOption('#student-week-picker', 'w1'); await pause(r.page, 700);
  const before = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  await r.page.click('#edit-assignment'); await pause(r.page, 200);
  await r.page.fill('#assignment-text', '¡Hola! Me llamo Minji. Soy de Corea y soy estudiante.');
  await r.page.click('#submit-assignment'); await pause(r.page, 900);
  let d = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  assert(d.revision === 2, '재제출 회차: ' + d.revision);
  assert(JSON.stringify(d.firstSubmittedAt) === JSON.stringify(before.submittedAt), '처음 제출 시각이 기존 제출 시각이 아님');
  assert((await r.page.innerText('.submitted-card')).includes('수정본 확인 전') && (await r.page.innerText('.submitted-card')).includes('2차 제출'), '학생 화면에 재검토 대기 안내가 없음');
  await r.page.click('#edit-assignment'); await pause(r.page, 200);
  await r.page.fill('#assignment-text', '세 번째 답안');
  await r.page.click('#submit-assignment'); await pause(r.page, 900);
  d = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  assert(d.revision === 3 && JSON.stringify(d.firstSubmittedAt) === JSON.stringify(before.submittedAt), '3차 제출 후 회차/처음 제출 시각 이상');
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s1', { revision: 2, latestSubmittedAt: window.__mock.ts(Date.now()), submittedAt: window.__mock.ts(Date.now()) }));
  await r.page.click('[data-page="feedback"]'); await pause(r.page, 500);
  await r.page.selectOption('#admin-week-picker', 'w1'); await pause(r.page, 700);
  assert((await r.page.innerText('[data-feedback-uid="s1"]')).includes('재검토 대기'), '강사 목록에 재검토 대기가 없음');
  await r.page.selectOption('#feedback-status-filter', 'rereview'); await pause(r.page, 300);
  const rows = await r.page.$$eval('[data-feedback-uid]', els => els.map(e => e.dataset.feedbackUid));
  assert(rows.length === 1 && rows[0] === 's1', '재검토 대기 필터: ' + rows.join(','));
  await r.page.click('[data-feedback-uid="s1"]'); await pause(r.page, 400);
  await r.page.fill('[data-feedback-text]', '수정본 좋아요.');
  await r.page.click('[data-feedback-save]'); await pause(r.page, 800);
  const fb = (await dump(r.page, 'classes/c1/weeks/w1/submissions/s1')).feedbacks.at(-1);
  assert(fb.forRevision === 2, '피드백 대상 회차: ' + fb.forRevision);
  assert(!(await r.page.$('[data-feedback-uid="s1"]')), '피드백 후에도 재검토 대기 필터에 남음');
  await r.page.selectOption('#feedback-status-filter', 'all'); await pause(r.page, 300);
  assert((await r.page.innerText('[data-feedback-uid="s1"]')).includes('피드백 완료'), '피드백 후 상태가 피드백 완료가 아님');
});

test('B11 피드백·마감 시각은 브라우저 시간대와 상관없이 한국 시간으로 표시', async b => {
  for (const timezoneId of ['Asia/Seoul', 'Europe/Madrid', 'America/Los_Angeles']) {
    const { page, context } = await openApp(b, { file: 'index.html', user: 's1', timezoneId, viewport: { width: 390, height: 844 } });
    await pause(page, 600);
    await page.click('[data-tab="assignment"]'); await pause(page, 500);
    await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700);
    const text = await page.innerText('#student-body');
    assert(/선생님 · \d+월 \d+일 \(.\) 오전 10:00/.test(text), `${timezoneId}: 피드백 시각이 한국 시간 오전 10:00이 아님`);
    assert(/제출 권장일 \d+월 \d+일 \(.\) 오후 11:59/.test(text), `${timezoneId}: 마감 표시가 한국 시간이 아님`);
    await context.close();
  }
});

test('B12 강사 메모: Enter는 줄바꿈, Ctrl+Enter는 저장', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c1"]'); await pause(page, 900);
  await rowAction(page, 's1', 'data-student-memo'); await pause(page, 500);
  await page.click('.app-modal-input');
  await page.keyboard.type('수업 전에 일찍 옴');
  await page.keyboard.press('Enter');
  await page.keyboard.type('발음 연습을 좋아함');
  assert(await page.$('.app-modal'), 'Enter에 모달이 닫힘(저장됨)');
  assert((await page.inputValue('.app-modal-input')).includes('\n'), '줄바꿈이 들어가지 않음');
  assert((await page.innerText('.app-modal-hint')).includes('Enter로 저장'), '저장 단축키 안내가 없음');
  await page.keyboard.press('Control+Enter'); await pause(page, 600);
  assert(!(await page.$('.app-modal')), 'Ctrl+Enter로 저장되지 않음');
  assert(((await dump(page, 'classes/c1/teacherNotes/s1'))?.text || '').includes('\n'), '저장된 메모에 줄바꿈이 없음');
});

test('B13 여러 줄 피드백을 수정해도 줄바꿈 유지', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 400);
  await page.click('[data-edit-feedback="s1:0"]'); await pause(page, 400);
  assert(await page.$('textarea.app-modal-input'), '피드백 수정창이 여러 줄 입력이 아님');
  assert((await page.inputValue('.app-modal-input')).includes('\n'), '기존 줄바꿈이 사라짐');
  await page.click('.app-modal-input'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('세 번째 줄');
  await page.keyboard.press('Control+Enter'); await pause(page, 800);
  const text = (await dump(page, 'classes/c1/weeks/w1/submissions/s1')).feedbacks[0].text;
  assert(text.split('\n').length === 3, '수정 후 줄 수: ' + JSON.stringify(text));
});

test('B13b 한글 조합 중 Enter는 저장하지 않음 (한 줄 입력 모달)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c1"]'); await pause(page, 900);
  await rowAction(page, 's1', 'data-edit-name'); await pause(page, 400);
  await page.fill('.app-modal-input', '김민지');
  await page.$eval('.app-modal-input', el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
  await pause(page, 300);
  assert(await page.$('.app-modal'), '조합 중 Enter에 저장됨');
  await page.keyboard.press('Enter'); await pause(page, 600);
  assert(!(await page.$('.app-modal')), '조합이 끝난 Enter로 저장되지 않음');
});

test('B13c 모달: Tab은 모달 안에서만 돌고, 닫으면 연 버튼으로 포커스가 돌아감', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.focus('[data-rotate-class="c1"]'); await page.keyboard.press('Enter'); await pause(page, 400);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => !!document.activeElement.closest('.app-modal')), 'Tab으로 모달 밖에 포커스'); }
  assert((await page.innerText('#app-modal-title')) === '수강 코드 재발급', '확인 창 제목: ' + await page.innerText('#app-modal-title'));
  await page.keyboard.press('Escape'); await pause(page, 300);
  assert(await page.evaluate(() => document.activeElement?.dataset.rotateClass === 'c1'), '닫은 뒤 포커스가 원래 버튼으로 돌아가지 않음');
});

test('P0-07 상태 배지: 색 + 기호 + 글자 (정답·오답·출석·불참·답변 대기)', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  for (const pick of ['20살', 'X', 'quince']) { await page.click(`.answer-option:has-text("${pick}")`); await page.click('#quiz-next'); await pause(page, 250); }
  await pause(page, 600);
  const pills = await page.$$eval('.review-line .pill', els => els.map(e => e.className + '|' + e.textContent));
  assert(pills.some(x => x.includes('success') && x.includes('✓정답')) && pills.some(x => x.includes('danger') && x.includes('✕오답')), '정답/오답 배지: ' + pills.join(' / '));
  await page.click('[data-tab="mypage"]'); await pause(page, 800);
  const att = await page.$$eval('#attendance-overview .pill', els => els.map(e => e.className + '|' + e.textContent));
  assert(att.some(x => x.includes('danger') && x.includes('✕불참')) && att.some(x => x.includes('neutral') && x.includes('–미입력')), '출석 배지: ' + att.join(' / '));
});

// ---------- 배치 06: 데이터 구조 v2 ----------
test('D01 복수정답 문항이 있는 퀴즈 결과 저장 (Firestore는 배열 안의 배열을 저장하지 못함)', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700);
  await page.click('#quiz-full-retry'); await pause(page, 200);
  await page.click('.answer-option:has-text("좋은 밤 되세요")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("Hola")'); await page.click('.answer-option:has-text("Buenos días")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("O")'); await page.click('#quiz-next'); await pause(page, 900);
  const res = await dump(page, 'classes/c1/weeks/w1/quizResults/s2');
  assert(res.score === 3 && res.attemptCount === 2, '복수정답 퀴즈 저장 실패: ' + (await lastToast(page)) + ' ' + JSON.stringify(res).slice(0, 200));
  assert(JSON.stringify(res.answersById?.q12) === '[0,2]', '문항 ID별 답 저장 이상: ' + JSON.stringify(res.answersById));
});

test('D02 재제출 3회: 제출 이력 3개(이전 형식 → 1차 보존), 처음 제출 시각 불변, 강사 1차·3차 비교', async b => {
  let r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await r.page.selectOption('#student-week-picker', 'w1'); await pause(r.page, 700);
  const before = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  for (const text of ['두 번째 답안입니다.', '세 번째 답안입니다.']) {
    await r.page.click('#edit-assignment'); await pause(r.page, 200);
    await r.page.fill('#assignment-text', text); await r.page.click('#submit-assignment'); await pause(r.page, 900);
  }
  const revs = await r.page.evaluate(() => window.__mock.list('classes/c1/weeks/w1/submissions/s1/revisions/').map(p => window.__mock.dump(p)));
  assert(revs.length === 3, '제출 이력 개수: ' + revs.length);
  assert(revs[0].legacy === true && revs[0].text === before.text && JSON.stringify(revs[0].submittedAt) === JSON.stringify(before.submittedAt), '1차(이전 제출) 보존 이상: ' + JSON.stringify(revs[0]));
  assert(revs[2].revision === 3 && revs[2].text === '세 번째 답안입니다.', '3차 기록 이상');
  const sum = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  assert(sum.revision === 3 && JSON.stringify(sum.firstSubmittedAt) === JSON.stringify(before.submittedAt), '요약 문서 회차/처음 제출 시각 이상');
  await r.page.click('[data-revision-history] summary'); await pause(r.page, 600);
  const hist = await r.page.innerText('[data-revision-list]');
  assert(hist.includes('2차 제출') && hist.includes('1차 제출') && hist.includes(before.text.slice(0, 10)), '학생 이전 제출 보기: ' + hist);
  // 같은 결과를 강사 화면에서 확인(모의 저장소는 페이지마다 따로이므로 이력을 옮겨 씀)
  const docs = await r.page.evaluate(() => Object.fromEntries(window.__mock.list('classes/c1/weeks/w1/submissions/s1').map(p => [p, window.__mock.dump(p)])));
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(docs => { for (const [p, d] of Object.entries(docs)) window.__mock.remoteWrite(p, d, { merge: false }); }, docs);
  await r.page.click('[data-page="feedback"]'); await pause(r.page, 500);
  await r.page.selectOption('#admin-week-picker', 'w1'); await pause(r.page, 700);
  await r.page.click('[data-feedback-uid="s1"]'); await pause(r.page, 700);
  assert((await r.page.$$('.revision-tab')).length === 3, '회차 탭 개수');
  await r.page.click('[data-compare]'); await pause(r.page, 300);
  await r.page.selectOption('[data-compare-left]', '1'); await pause(r.page, 200);
  await r.page.selectOption('[data-compare-right]', '3'); await pause(r.page, 200);
  const cmp = await r.page.innerText('.revision-compare');
  assert(cmp.includes(before.text.slice(0, 10)) && cmp.includes('세 번째 답안입니다.'), '1차·3차 비교: ' + cmp);
  const fb = await r.page.innerText('#feedback-inspector');
  assert(fb.includes('1차 제출에 대한 피드백'), '피드백이 회차별로 묶이지 않음');
});

test('D04 퀴즈 보기 내용을 바꿔 저장 → 버전 2, 이전 응시 기록은 버전 1 문항으로 표시 · 제목만 바꾸면 그대로', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w1"]'); await pause(page, 400);
  await page.click('[data-week-tab="quiz"]'); await pause(page, 300);
  await page.fill('#quiz-title', '인사 복습(제목만 수정)');
  await page.click('#save-week'); await pause(page, 900);
  assert((await dump(page, 'classes/c1/weeks/w1')).quiz.version === 1, '제목만 바꿨는데 버전이 올라감');
  await page.click('[data-week-open="w1"]'); await pause(page, 400);
  await page.click('[data-week-tab="quiz"]'); await pause(page, 300);
  await page.fill('.quiz-editor-question >> nth=0 >> [data-option="2"]', '좋은 밤 되세요');
  await page.click('#save-week'); await pause(page, 900);
  const w = await dump(page, 'classes/c1/weeks/w1');
  assert(w.quiz.version === 2, '퀴즈 버전: ' + w.quiz.version);
  const v2 = await dump(page, 'classes/c1/weeks/w1/quizVersions/2');
  assert(v2?.questions?.[0]?.options?.[2] === '좋은 밤 되세요', '버전 2 사본이 없음');
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.click('[data-feedback-tab="quizResults"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s1"]'); await pause(page, 500);
  await page.click('[data-attempt-history] summary'); await pause(page, 800);
  const hist = await page.innerText('[data-attempt-content]');
  assert(hist.includes('문제 버전 1'), '응시 기록의 문제 버전 표시: ' + hist.slice(0, 200));
  await page.click('[data-attempt-content] details >> nth=0 >> summary'); await pause(page, 300);
  assert((await page.innerText('[data-attempt-content]')).includes('좋은 밤 되세요 / 안녕히 주무세요'), '이전 응시가 버전 1 보기로 표시되지 않음');
});

test('D05 응시 도중 강사가 퀴즈를 바꿔도 시작한 버전으로 저장', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.click('.answer-option:has-text("20살")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w4', { quiz: { version: 2 } }));
  await pause(page, 600);
  await page.click('.answer-option:has-text("O")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("quince")'); await page.click('#quiz-next'); await pause(page, 900);
  const res = await dump(page, 'classes/c1/weeks/w4/quizResults/s2');
  assert(res?.quizVersion === 1 && res.firstAttempt.quizVersion === 1, '저장된 버전: ' + res?.quizVersion);
  assert(JSON.stringify(res.questionIds) === JSON.stringify(['q41', 'q42', 'q43']), '문항 순서 기록: ' + JSON.stringify(res.questionIds));
});

test('D06 수강 중지·재등록 기록과 날짜별 수강 판정(wasActiveAt)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c1"]'); await pause(page, 900);
  await rowAction(page, 's2', 'data-status-uid'); await ok(page); await pause(page, 700);
  await rowAction(page, 's2', 'data-status-uid'); await ok(page); await pause(page, 700);
  const types = await page.evaluate(() => window.__mock.list('enrollments/s2_c1/events/').map(p => window.__mock.dump(p).type));
  assert(JSON.stringify(types.sort()) === JSON.stringify(['resumed', 'stopped']), '기록: ' + types.join(','));
  const verdicts = await page.evaluate(async () => {
    const { wasActiveAt } = await import('/common.js?v=test');
    const ts = s => ({ seconds: Date.parse(s + 'T03:00:00Z') / 1000 });
    const en = { status: 'inactive', joinedAt: ts('2026-09-01') };
    const ev = [{ type: 'joined', at: ts('2026-09-01') }, { type: 'stopped', at: ts('2026-10-10') }];
    return ['2026-08-31', '2026-09-15', '2026-10-10', '2026-10-20'].map(d => wasActiveAt(en, ev, d).active)
      .concat([wasActiveAt({ status: 'inactive', joinedAt: ts('2026-09-01') }, [], '2026-10-01').estimated]);
  });
  assert(JSON.stringify(verdicts) === JSON.stringify([false, true, false, false, true]), 'wasActiveAt: ' + JSON.stringify(verdicts));
});

test('D07 녹음 길이가 제출·이력에 저장되고 화면에 표시됨', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.selectOption('#student-week-picker', 'w2'); await pause(page, 700);
  await page.click('#student-audio-ui [data-record-start]'); await pause(page, 2300);
  await page.click('#student-audio-ui [data-record-stop]'); await pause(page, 500);
  await page.click('#submit-assignment'); await pause(page, 1200);
  const d = await dump(page, 'classes/c1/weeks/w2/submissions/s2');
  assert(d?.audioDuration >= 2 && d.audioDuration <= 4, '저장된 길이: ' + d?.audioDuration);
  const rev = await dump(page, 'classes/c1/weeks/w2/submissions/s2/revisions/1');
  assert(rev?.audioDuration === d.audioDuration, '이력의 길이: ' + rev?.audioDuration);
  assert(/0:0[2-4]/.test(await page.innerText('.audio-duration')), '길이 표시: ' + await page.innerText('.audio-duration'));
});

test('D08 학생 확인 시각: 피드백을 보면 기록, 강사 화면에 학생 확인 표시 · 질문 대화를 열면 기록', async b => {
  let r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await r.page.selectOption('#student-week-picker', 'w1'); await pause(r.page, 900);
  const seen = (await dump(r.page, 'classes/c1/weeks/w1/submissions/s1')).studentSeenFeedbackAt;
  assert(seen, '피드백 확인 시각이 저장되지 않음');
  await r.page.click('[data-tab="questions"]'); await pause(r.page, 600);
  await r.page.click('[data-qid="q1"]'); await pause(r.page, 600);
  assert((await dump(r.page, 'classes/c1/questions/q1')).studentSeenAt, '질문 확인 시각이 저장되지 않음');
  const writes = (await r.page.evaluate(() => window.__mock.writes())).filter(w => w.path === 'classes/c1/weeks/w1/submissions/s1');
  assert(writes.length === 1, '확인 시각을 여러 번 저장함: ' + writes.length);
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(s => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s1', { studentSeenFeedbackAt: s }), seen);
  await r.page.click('[data-page="feedback"]'); await pause(r.page, 500);
  await r.page.selectOption('#admin-week-picker', 'w1'); await pause(r.page, 700);
  await r.page.click('[data-feedback-uid="s1"]'); await pause(r.page, 500);
  assert((await r.page.innerText('#feedback-inspector')).includes('학생 확인'), '강사 화면에 학생 확인 표시가 없음');
});

test('D09 학생 입장 시 입장 기록(joined) — v3 규칙에서는 함께 저장, v2 규칙에서는 등록만 저장', async b => {
  for (const rules of ['v3', 'v2']) {
    const { page, context } = await openAs(b, 'index.html', 's6', { rules, viewport: { width: 390, height: 844 } });
    await page.fill('#join-code', 'HOLA2026'); await page.click('#join-form button[type="submit"]'); await pause(page, 1200);
    assert((await dump(page, 'enrollments/s6_c1'))?.status === 'active', rules + ': 입장 실패');
    const events = await page.evaluate(() => window.__mock.list('enrollments/s6_c1/events/').map(p => window.__mock.dump(p).type));
    assert(rules === 'v3' ? events.join() === 'joined' : events.length === 0, rules + ': 입장 기록 ' + events.join(','));
    await context.close();
  }
});

// ---------- 배치 07: 작업 보존 · 오류 처리 · 임시 파일 정리 ----------
const lsKeys = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('senorayu:draft:')));
test('B15 차시 편집 미저장 상태로 다른 차시 선택 → 확인창 → [버리고 이동]이면 저장 안 함', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w1"]'); await pause(page, 400);
  await page.click('[data-week-tab="assignment"]'); await pause(page, 200); // 수업 흐름 순서 탭: 예습이 먼저
  await page.fill('#assignment-title', '바꾼 과제 제목');
  assert((await page.innerText('#week-save-status')).includes('저장하지 않은 변경'), '미저장 표시: ' + await page.innerText('#week-save-status'));
  await page.click('[data-week-open="w2"]'); await pause(page, 400);
  const buttons = await page.$$eval('.app-modal [data-choice]', els => els.map(e => e.textContent));
  assert(JSON.stringify(buttons) === JSON.stringify(['저장하고 이동', '버리고 이동', '취소']), '확인창 버튼: ' + buttons.join('|'));
  await page.click('.app-modal [data-choice="2"]'); await pause(page, 300); // 취소
  assert((await page.inputValue('#assignment-title')) === '바꾼 과제 제목', '취소했는데 편집 내용이 사라짐');
  await page.click('[data-week-open="w2"]'); await pause(page, 400);
  await page.click('.app-modal [data-choice="1"]'); await pause(page, 600); // 버리고 이동
  assert((await page.inputValue('#week-label')).startsWith('2차시'), '다른 차시로 이동하지 않음');
  assert((await dump(page, 'classes/c1/weeks/w1')).assignment.title === '자기소개 3문장 쓰고 녹음하기', '버렸는데 저장됨');
});

test('B15b 차시 편집 → 메뉴 이동 시 [저장하고 이동]이면 저장 후 이동', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w1"]'); await pause(page, 400);
  await page.click('[data-week-tab="assignment"]'); await pause(page, 200);
  await page.fill('#assignment-title', '저장할 새 제목');
  await page.click('[data-page="questions"]'); await pause(page, 400);
  await page.click('.app-modal [data-choice="0"]'); await pause(page, 900);
  assert((await dump(page, 'classes/c1/weeks/w1')).assignment.title === '저장할 새 제목', '저장되지 않음');
  assert(await page.$('#admin-questions-list'), '질문함으로 이동하지 않음');
});

test('B15c 저장하지 않은 업로드 파일은 [버리고 이동] 때 삭제', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w5"]'); await pause(page, 400);
  await page.click('[data-week-tab="preview"]'); await pause(page, 200);
  await page.setInputFiles('#preview-extra-file', { name: 'handout.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') });
  await pause(page, 600);
  const uploaded = (await page.evaluate(() => window.__mock.uploads())).map(u => u.path);
  assert(uploaded.length === 1, '업로드되지 않음');
  await page.click('[data-week-open="w4"]'); await pause(page, 400);
  await page.click('.app-modal [data-choice="1"]'); await pause(page, 600);
  const deleted = await page.evaluate(() => window.__mock.deletedFiles());
  assert(deleted.includes(uploaded[0]), '저장하지 않은 업로드가 남음: ' + JSON.stringify(deleted));
  assert(!(await dump(page, 'classes/c1/weeks/w5')).preview.files.some(f => f.path === uploaded[0]), '문서에 연결됨');
});

test('B16 강사 피드백: 학생 A 작성 → 학생 B → A로 돌아와도, 새로고침해도 입력 유지', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  const open = async () => { await page.click('[data-page="feedback"]'); await pause(page, 500); await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700); };
  await open();
  await page.click('[data-feedback-uid="s2"]'); await pause(page, 400);
  await page.fill('[data-feedback-text]', '이준호님, 다음에는 직업도 말해 봐요.');
  await page.click('[data-feedback-uid="s3"]'); await pause(page, 400);
  assert(!(await page.inputValue('[data-feedback-text]')), '다른 학생 입력칸에 글이 보임');
  assert(!(await page.$eval('[data-feedback-uid="s2"] [data-draft-mark]', el => el.classList.contains('hide'))), '목록에 작성 중 표시가 없음');
  await page.click('[data-feedback-uid="s2"]'); await pause(page, 400);
  assert((await page.inputValue('[data-feedback-text]')) === '이준호님, 다음에는 직업도 말해 봐요.', '돌아왔을 때 입력 사라짐');
  await pause(page, 500); await page.reload(); await pause(page, 900); await open();
  await page.click('[data-feedback-uid="s2"]'); await pause(page, 400);
  assert((await page.inputValue('[data-feedback-text]')).includes('직업도'), '새로고침 후 복원되지 않음');
  await page.click('[data-feedback-save]'); await pause(page, 900);
  assert(!(await lsKeys(page)).length, '등록 후에도 임시 저장본이 남음');
});

test('B17 학생 답안: 수정 → 다른 탭 → 돌아오면 유지, 새로고침 복원, 제출하면 삭제', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.fill('#assignment-text', 'Mi madre tiene cincuenta años.');
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.click('[data-tab="assignment"]'); await pause(page, 700);
  assert((await page.inputValue('#assignment-text')) === 'Mi madre tiene cincuenta años.', '탭 이동 후 사라짐');
  assert(await page.$('[data-draft-notice]'), '임시 저장본 안내가 없음');
  await page.reload(); await pause(page, 900);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  assert((await page.inputValue('#assignment-text')).includes('cincuenta'), '새로고침 후 복원되지 않음');
  await page.click('#submit-assignment'); await pause(page, 1000);
  assert(!(await lsKeys(page)).length, '제출 후에도 임시 저장본이 남음');
});

test('B17b 임시 저장 답안: 로그아웃하면 안내 후 삭제, 다른 계정에는 보이지 않음', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.fill('#assignment-text', '이준호의 초안'); await pause(page, 700);
  await page.evaluate(() => window.__mock.loginAs('s1')); await pause(page, 1200);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  assert(!(await page.inputValue('#assignment-text')).includes('이준호의 초안'), '다른 계정에 초안이 보임');
  await page.evaluate(() => window.__mock.loginAs('s2')); await pause(page, 1200);
  await page.click('#student-logout'); await pause(page, 400);
  assert((await page.innerText('.app-modal')).includes('임시 저장된 답안이 지워져요'), '로그아웃 안내가 없음');
  await ok(page); await pause(page, 600);
  assert(!(await lsKeys(page)).some(k => k.includes(':s2:')), '로그아웃 후에도 초안이 남음');
});

test('B17c 퀴즈를 3번 문항까지 풀다 다른 탭 → 복습 탭 → [이어서 풀기]로 3번 문항과 답 유지', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w4'); await pause(page, 700);
  await page.click('.answer-option:has-text("20살")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("O")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("quince")'); await pause(page, 200);
  await page.click('[data-tab="questions"]'); await pause(page, 500);
  await page.click('[data-tab="quiz"]'); await pause(page, 700);
  assert((await page.innerText('#quiz-content')).includes('풀던 문제가 있어요'), '이어 풀기 안내가 없음');
  await page.click('[data-resume]'); await pause(page, 300);
  assert((await page.textContent('.question-count')).includes('3 /'), '3번 문항이 아님');
  assert((await page.innerText('.answer-option.selected')).includes('quince'), '고른 답이 사라짐');
  await page.click('#quiz-next'); await pause(page, 900);
  assert((await dump(page, 'classes/c1/weeks/w4/quizResults/s2'))?.score === 3, '이어 푼 결과 저장 실패');
});

test('B18 기록을 불러오지 못하면 "불러오지 못했어요"와 다시 시도 (미제출로 보이지 않음, 개발 용어 없음)', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await page.evaluate(() => window.__mock.failReads('classes/c1/weeks/w1/submissions/s1$'));
  await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700);
  const area = await page.innerText('#assignment-area');
  assert(area.includes('불러오지 못했어요') && await page.$('#assignment-area [data-retry]'), '불러오기 실패 안내: ' + area);
  assert(!(await page.$('#submit-assignment')), '실패했는데 제출 폼이 보임');
  assert(!/Firestore|Storage|permission|보안 규칙/i.test(area), '학생 화면에 개발 용어: ' + area);
});

test('B19 Firebase CDN이 막히면 백지 대신 안내 화면', async b => {
  const { page } = await openApp(b, { file: 'index.html', user: 's1', blockCdn: true, bootTimeoutMs: 1200 });
  await pause(page, 1800);
  const text = await page.innerText('#root');
  assert(text.includes('화면을 불러오지 못했어요') && text.includes('새로고침'), '안내 화면이 없음: ' + text.slice(0, 80));
});

// ---------- 배치 08: 차시 구조 ----------
test('S01 정렬 번호를 바꾸면 반 일정 사본·출석 드롭다운 순서가 차시 목록과 같아짐', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w3"]'); await pause(page, 400);
  await page.fill('#week-order', '99'); await page.fill('#week-date', '2027-01-15');
  await page.click('#save-week'); await pause(page, 900);
  const listOrder = await page.$$eval('[data-week-open]', els => els.map(e => e.dataset.weekOpen));
  const schedule = (await dump(page, 'classes/c1')).schedule;
  assert(JSON.stringify(schedule.map(x => x.weekId)) === JSON.stringify(listOrder), '일정 사본 순서: ' + schedule.map(x => x.weekId).join(',') + ' / 목록: ' + listOrder.join(','));
  assert(schedule.at(-1).weekId === 'w3' && schedule.at(-1).date === '2027-01-15', '바꾼 날짜가 사본에 반영되지 않음');
  assert((await dump(page, 'classes/c1/weeks/w3')).sessionDate === '2027-01-15', '차시 문서에 날짜가 저장되지 않음');
  await page.click('[data-page="attendance"]'); await pause(page, 600);
  const options = await page.$$eval('#quick-session option', os => os.map(o => o.value));
  assert(JSON.stringify(options) === JSON.stringify(listOrder), '출석 드롭다운 순서: ' + options.join(','));
});

test('S02 반 수정 모달과 + 새 차시 어느 쪽으로 만들어도 차시 문서와 일정 사본이 일치', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-edit-class="c2"]'); await pause(page, 600);
  await page.click('#course-add-session'); await pause(page, 200);
  await page.fill('#course-date-fields [data-session="4"] [data-session-date]', '2026-12-05');
  await page.click('#course-submit'); await pause(page, 1200);
  await page.selectOption('#admin-class-switch', 'c2'); await pause(page, 700);
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('#new-week'); await pause(page, 300);
  await page.fill('#new-week-label', '보충 차시'); await page.fill('#new-week-date', '2026-12-12');
  await page.click('#week-create-form button[type="submit"]'); await pause(page, 900);
  const weeks = await page.evaluate(() => window.__mock.list('classes/c2/weeks/').filter(p => p.split('/').length === 4).map(p => ({ id: p.split('/')[3], ...window.__mock.dump(p) })));
  const schedule = (await dump(page, 'classes/c2')).schedule;
  const expect = [...weeks].sort((x, y) => x.order - y.order).map(w => `${w.id}|${w.label}|${w.sessionDate || ''}`);
  assert(JSON.stringify(schedule.map(x => `${x.weekId}|${x.label}|${x.date}`)) === JSON.stringify(expect), '불일치\n사본 ' + JSON.stringify(schedule) + '\n문서 ' + JSON.stringify(expect));
  assert(weeks.length === 6 && weeks.some(w => w.label === '보충 차시' && w.sessionDate === '2026-12-12'), '새 차시 생성 이상');
});

test('S03 sessionState: 어제·오늘·내일·날짜 없음(출결 있음/없음)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  const r = await page.evaluate(async () => {
    const { sessionState, todayKey } = await import('/common.js?v=test');
    const day = n => todayKey(new Date(Date.now() + n * 86400000));
    return [sessionState({ date: day(-1) }), sessionState({ date: day(0) }), sessionState({ date: day(1) }), sessionState({}, undefined, { hasAttendance: true }), sessionState({})];
  });
  assert(JSON.stringify(r) === JSON.stringify(['done', 'today', 'upcoming', 'done', 'upcoming']), JSON.stringify(r));
});

test('S04 학생 예습(D8): 홈에서 다음 수업 예습을 열면 그 차시가 선택되고, 하단 메뉴는 홈·과제·복습·질문·내 정보(D6)', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 }, tab: 'home' });
  eq(await page.$$eval('.nav-item .nav-label', els => els.map(e => e.textContent)), ['홈', '과제', '복습', '질문', '내 정보'], '하단 메뉴');
  await page.click('.home-preview [data-home-go="preview"]'); await pause(page, 600);
  assert((await page.inputValue('#student-week-picker')) === 'w5', '기본 선택: ' + await page.inputValue('#student-week-picker'));
  const head = await page.innerText('.page-head');
  assert(head.includes('예습') && /5차시 · 카페에서 주문하기 수업 준비 · \d+월 \d+일 \(.\)/.test(head), '머리말: ' + head);
  assert(await page.$eval('.nav-item[data-tab="home"]', el => el.classList.contains('active') && el.getAttribute('aria-current') === 'page'), '예습 화면에서 홈 메뉴가 켜지지 않음');
});

test('S05 유튜브 링크: 허용 주소만 추가, 학생 화면은 youtube-nocookie 임베드, 지난 반에서는 숨김', async b => {
  let r = await openAs(b, 'admin.html', 'admin1');
  await r.page.click('[data-page="weeks"]'); await pause(r.page, 500);
  await r.page.click('[data-week-open="w5"]'); await pause(r.page, 400);
  await r.page.fill('#preview-video-link', 'https://evil.example.com/watch?v=dQw4w9WgXcQ'); await r.page.click('#add-video-link'); await pause(r.page, 200);
  assert((await lastToast(r.page)).includes('유튜브 영상 주소'), '잘못된 주소를 받아들임');
  await r.page.fill('#preview-video-link', 'https://youtu.be/dQw4w9WgXcQ?si=abc'); await r.page.click('#add-video-link'); await pause(r.page, 200);
  assert((await r.page.innerText('#preview-videos-list')).includes('유튜브 링크'), '영상 종류 표시 없음');
  await r.page.click('#save-week'); await pause(r.page, 900);
  const v = (await dump(r.page, 'classes/c1/weeks/w5')).preview.videos;
  assert(v.length === 1 && v[0].kind === 'youtube' && v[0].videoId === 'dQw4w9WgXcQ', '저장 형식: ' + JSON.stringify(v));
  await r.context.close();
  r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 }, tab: 'home' });
  await r.page.evaluate(v => window.__mock.remoteWrite('classes/c1/weeks/w5', { preview: { videos: v } }), v);
  await pause(r.page, 400);
  await r.page.click('.home-preview [data-home-go="preview"]'); await pause(r.page, 600);
  const src = await r.page.getAttribute('.video-embed iframe', 'src');
  assert(src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0', 'iframe 주소: ' + src);
  await r.context.close();
  r = await openAs(b, 'index.html', 's5', { viewport: { width: 390, height: 844 } });
  await r.page.evaluate(v => window.__mock.remoteWrite('classes/c3/weeks/ow1', { preview: { videos: v } }), v);
  await r.page.click('[data-past-class="c3"]'); await pause(r.page, 700);
  await r.page.selectOption('#student-week-picker', 'ow1'); await pause(r.page, 400);
  await r.page.click('[data-tab="preview"]'); await pause(r.page, 600);
  assert(!(await r.page.$('iframe')) && (await r.page.innerText('#student-body')).includes('수강 기간에만'), '지난 반에 유튜브 영상이 보임');
});

test('S06 차시 편집: 학생에게 보이는 범위 요약과 수업 흐름 순서 탭', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w6"]'); await pause(page, 400);
  assert((await page.innerText('#week-visibility')).includes('비공개 초안'), '비공개 요약: ' + await page.innerText('#week-visibility'));
  await page.click('label.switch:has(#week-published)'); await pause(page, 150);
  assert((await page.innerText('#week-visibility')).includes('공개됨 — 예습 ✕ · 과제 ✕ · 복습 퀴즈 ✕ · 수업 영상 ✕'), '공개 요약: ' + await page.innerText('#week-visibility'));
  const tabs = await page.$$eval('[data-week-tab]', els => els.map(e => e.textContent));
  assert(JSON.stringify(tabs) === JSON.stringify(['수업 전 · 예습', '수업 후 · 과제', '수업 후 · 복습']), '탭: ' + tabs.join('|'));
  assert((await page.innerText('[data-week-panel="preview"] .notice')).includes('수업(') , '예습 탭 안내 없음');
});

// ----- 배치 09: 대시보드 -----
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const firstLine = els => els.map(e => e.firstChild.textContent.trim());

test('B14 대시보드: 차시별 추이·진행표에 오늘·미래 차시(5~12차시)가 없음', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await pause(page, 600);
  for (const panel of [1, 2, 3]) {
    const labels = await page.$$eval(`.dash-panels .dash-panel:nth-child(${panel}) .dash-bar-label`, firstLine);
    eq(labels, ['1차시', '2차시', '3차시', '4차시'], `추이 ${panel}번째 차트`);
  }
  eq(await page.$$eval('.dash-grid thead th[colspan]', firstLine), ['1차시', '2차시', '3차시', '4차시'], '진행표 차시');
  const live = await page.evaluate(() => window.__mock.listenerCount());
  assert(live > 0 && live <= 50, '실시간 구독 수: ' + live);
});

test('B14b 대시보드: 중도 등록 학생은 등록 전 차시 분모에서 빠지고, 기록은 수강 기간 밖으로 표시', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await pause(page, 600);
  // 박서연(s3)은 20일 전에 반을 옮겨 와 1·2차시(28·21일 전) 대상이 아님. 1차시 인정결석 기록은 출석률에 넣지 않음
  const first = await page.$eval('.dash-panels .dash-panel:nth-child(1) .dash-bar-row:first-child .dash-bar-value', e => e.innerText.replace(/\s+/g, ' '));
  eq(first, '100% 3/3', '1차시 출석률');
  const kpi = await page.$eval('.dash-kpi', e => e.innerText.replace(/\s+/g, ' '));
  assert(kpi.includes('90% 9/10건') && kpi.includes('입력 10/13건'), '출석률 지표: ' + kpi);
  const row = await page.$$eval('.dash-grid tbody tr', trs => trs.map(tr => [tr.querySelector('th').innerText.split('\n')[0], [...tr.querySelectorAll('td')].slice(0, 3).map(td => td.className.includes('is-outside'))]));
  eq(row.find(r => r[0] === '박서연')[1], [true, true, true], '박서연 1차시 칸');
  // 수강 중지(12일 전) 최도윤: 4차시(7일 전)는 빈칸
  const doyun = await page.$$eval('.dash-grid tbody tr', trs => { const tr = trs.find(t => t.innerText.startsWith('최도윤')); return [...tr.querySelectorAll('td')].slice(9).map(td => td.className.includes('is-blank')); });
  eq(doyun, [true, true, true], '최도윤 4차시 칸');
});

test('B14c 대시보드: 수강 기간 기록을 읽지 못하면(이전 규칙) 등록일 기준으로 추정하고 안내', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.evaluate(() => window.__mock.failReads('^enrollments/[^/]+/events'));
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-page="overview"]'); await pause(page, 900);
  assert((await page.innerText('#insight-content')).includes('수강 기간 기록을 읽지 못해'), '안내 없음');
  // 수강 중지 학생은 중지 시점을 몰라 4차시까지 대상으로 추정(*)
  const est = await page.$$eval('.dash-grid tbody tr', trs => { const tr = trs.find(t => t.innerText.startsWith('최도윤')); return tr.querySelectorAll('td.is-estimated').length; });
  assert(est === 12, '추정 표시 칸 수: ' + est);
  assert(!(await page.$('.load-failed')), '오류 화면이 뜸');
});

test('DB01 computeDashboard: 대상자·출석률·입력률·제출률·참여율·첫 응시 정답률(이전 기록 제외)·처리할 일', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  const r = await page.evaluate(async () => {
    const { computeDashboard } = await import('/dashboard.js');
    const c = await import('/common.js?v=test');
    const today = c.todayKey(), at = n => new Date(Date.now() + n * 86400000), day = n => c.todayKey(at(n));
    const quiz = { enabled: true, questions: [{ id: 'q1', type: 'single', options: ['a', 'b'], correctIndices: [0] }] };
    const off = { enabled: false };
    const sessions = [
      { id: 's1', label: '1차시 · 인사', date: day(-14), published: true, assignment: { enabled: true }, quiz, preview: { enabled: true } },
      { id: 's2', label: '2차시', date: day(-7), published: true, assignment: { enabled: true }, quiz, preview: { enabled: true } },
      { id: 's3', label: '3차시', date: today, published: true, assignment: { enabled: true }, quiz: off, preview: { enabled: false, mode: 'rich', richHtml: '<p>인사 표현 읽어 오기</p>' } }, // 만든 예습이 꺼짐
      { id: 's4', label: '4차시', date: day(2), published: false, assignment: off, quiz: off, preview: { enabled: true, videos: [{ kind: 'youtube', videoId: 'v1', name: '영상' }] } }, // 예습은 켰지만 차시 비공개
      { id: 's5', label: '5차시', date: day(10), published: false, assignment: off, quiz: off, preview: off },
    ];
    const enrollments = [
      { id: 'A_c', uid: 'A', status: 'active', joinedAt: at(-30) },
      { id: 'B_c', uid: 'B', status: 'active', joinedAt: at(-30) },
      { id: 'C_c', uid: 'C', status: 'active', joinedAt: at(-10) },   // 중도 등록: 1차시(14일 전) 대상 아님
      { id: 'D_c', uid: 'D', status: 'inactive', joinedAt: at(-30) }, // 9일 전 수강 중지: 2차시(7일 전) 대상 아님
    ];
    const events = { D_c: [{ type: 'joined', at: at(-30) }, { type: 'stopped', at: at(-9) }] };
    const reviewed = forRevision => ({ feedbacks: [{ id: 'f', text: '좋아요', forRevision }] });
    const first = (score, total) => ({ firstAttempt: { score, total, legacy: false, quizVersion: 1 } });
    const input = {
      sessions, enrollments, events, names: { A: '가', B: '나', C: '다', D: '라' },
      attendance: {
        s1: [{ id: 'A', status: 'present' }, { id: 'B', status: 'late' }, { id: 'C', status: 'excused' }, { id: 'D', status: 'absent' }],
        s2: [{ id: 'A', status: 'present' }, { id: 'C', status: 'present' }],
      },
      submissions: {
        s1: [{ id: 'A' }, { id: 'C' }, { id: 'D' }],
        s2: [{ id: 'A', revision: 2, ...reviewed(1) }, { id: 'C', revision: 1, ...reviewed(1) }],
        s3: [{ id: 'A' }],
      },
      quizResults: {
        s1: [{ id: 'A', ...first(2, 4) }, { id: 'B', score: 1, total: 4 }, { id: 'D', ...first(4, 4) }], // B: 첫 응시 정보 없는 이전 기록
        s2: [{ id: 'A', ...first(3, 3) }, { id: 'C', ...first(1, 2) }],
      },
      questions: [{ needsTeacherReply: true }, { status: 'answered' }, { status: 'open' }],
    };
    const deps = { sessionState: c.sessionState, wasActiveAt: c.wasActiveAt, reviewState: c.reviewState, needsReply: c.needsReply, attendanceValue: c.attendanceValue, daysBetween: c.daysBetween };
    const d = computeDashboard(input, today, deps);
    const s = id => d.sessions.find(x => x.id === id);
    const rows = g => g.sessions.map(x => x.id + ':' + x.count);
    return {
      recent: d.recent, targets: [s('s1').targets, s('s2').targets], s1: s('s1').attendance, s2: s('s2').attendance,
      outside: s('s1').cells.get('C'), kpi: d.kpi, estimated: d.estimated,
      actions: [rows(d.actions.feedback), d.actions.rereview.total, d.actions.questions.total, rows(d.actions.attendance), d.actions.publish.sessions.map(x => x.id + ':' + x.reason), d.actions.total],
      watch: d.watch.map(w => w.name + ':' + w.reasons.map(x => x.text).join(',')),
    };
  });
  eq(r.recent, ['s1', 's2'], '추이 차시(오늘·미래 제외)');
  eq(r.targets, [3, 3], '차시 대상자 수');
  eq(r.s1, { present: 2, absent: 1, missing: 0 }, '1차시 출결(지각=출석, 대상 아닌 C의 인정결석 제외)');
  eq(r.s2, { present: 2, absent: 0, missing: 1 }, '2차시 출결');
  assert(r.outside.target === false && r.outside.outside === true, '중도 등록 학생 1차시 칸: ' + JSON.stringify(r.outside));
  const { attendance: att, assignment: asg, quiz: qz } = r.kpi;
  eq([att.present, att.recorded, att.expected, Math.round(att.rate * 100), Math.round(att.inputRate * 100)], [4, 5, 6, 80, 83], '출석률·입력률');
  eq([asg.submitted, asg.expected, Math.round(asg.rate * 100)], [4, 6, 67], '과제 제출률(실시간)');
  eq([asg.current.id, asg.current.state, asg.current.submitted, asg.current.targets], ['s3', 'today', 1, 3], '오늘 차시 제출 현황');
  eq([qz.attempted, qz.expected, qz.firstN, qz.average, qz.legacy], [5, 6, 4, 75, 1], '복습 참여·첫 응시 정답률(이전 기록 제외)');
  eq(r.actions, [['s1:2', 's3:1'], 1, 2, ['s2:1'], ['s3:예습 꺼짐', 's4:비공개'], 9], '처리할 일(피드백·재검토·질문·출결·공개 누락·합계)');
  eq(r.watch, ['나:1·2차시 과제 미제출'], '챙겨 볼 학생');
  assert(r.estimated === false, '추정 표시');
});

test('DB02 analyzeQuiz: 같은 버전 첫 응시만 · 문항별 정답률 · 보기별 선택 수 · 가장 많이 고른 오답', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  const r = await page.evaluate(async () => {
    const { analyzeQuiz } = await import('/dashboard.js');
    const c = await import('/common.js?v=test');
    const questions = [
      { id: 'q1', type: 'single', stem: '1', options: ['a', 'b', 'c', 'd'], correctIndices: [0] },
      { id: 'q2', type: 'multiple', stem: '2', options: ['p', 'q', 'r'], correctIndices: [0, 2] },
      { id: 'q3', type: 'ox', stem: '3', options: ['O', 'X'], correctIndices: [1] },
    ];
    const fa = x => ({ firstAttempt: { legacy: false, score: 0, total: 3, ...x } });
    const results = [
      fa({ quizVersion: 2, answersById: { q1: [0], q2: [0, 2], q3: [1] } }),
      fa({ quizVersion: 2, answersById: { q1: [1], q2: [0], q3: [1] } }),
      fa({ quizVersion: 2, answers: ['1', '0,1', '0'] }),                    // 문항 ID 없이 순서로 저장된 답
      fa({ quizVersion: 1, answersById: { q1: [0], q2: [0, 2], q3: [1] } }), // 다른 버전 → 분리
      { firstAttempt: { legacy: true, score: 1, total: 3, answers: ['0'] } }, // 이전 기록에서 가져온 첫 결과 → 분리
      { score: 2, total: 3, answers: [0, 0, 1] },                            // 첫 응시 정보 없음 → 분리
      fa({ answers: ['0', '0,2', '1'] }),                                    // 버전 기록 없음 → 분리
    ];
    const a = analyzeQuiz({ questions, version: 2, results }, { normalizeQuizQuestion: c.normalizeQuizQuestion, isCorrectAnswer: c.isCorrectAnswer, answersFor: c.answersFor });
    return { n: a.n, other: a.otherVersions, legacy: a.legacy, unversioned: a.unversioned, items: a.items.map(i => [i.id, i.n, i.correct, Math.round(i.p * 1000) / 1000, i.optionCounts, i.topWrong]) };
  });
  eq([r.n, r.other, r.legacy, r.unversioned], [3, { 1: 1 }, 2, 1], '집계 대상·분리한 기록');
  eq(r.items, [['q1', 3, 1, 0.333, [1, 2, 0, 0], [1]], ['q2', 3, 1, 0.333, [3, 1, 1], [1]], ['q3', 3, 2, 0.667, [1, 2], [0]]], '문항별(정답률 낮은 순)');
});

test('DB03 처리할 일 카드: 누르면 해당 화면·차시·필터가 적용된 상태로 열림', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await pause(page, 600);
  const back = async () => { await page.click('[data-page="overview"]'); await pause(page, 900); };
  const uids = () => page.$$eval('[data-feedback-uid]', els => els.map(e => e.dataset.feedbackUid).sort());
  // 피드백 대기: 1·3차시에 걸쳐 있어 펼친 뒤 3차시
  await page.click('details[data-action-kind="feedback"] summary'); await pause(page, 150);
  await page.click('details[data-action-kind="feedback"] [data-go]:has-text("3차시")'); await pause(page, 900);
  eq([await page.inputValue('#admin-week-picker'), await page.inputValue('#feedback-status-filter'), await uids()], ['w3', 'unreviewed', ['s1', 's3']], '피드백 대기');
  await back();
  await page.click('button.dash-action:has-text("재검토 대기")'); await pause(page, 900);
  eq([await page.inputValue('#admin-week-picker'), await page.inputValue('#feedback-status-filter'), await uids()], ['w2', 'rereview', ['s1']], '재검토 대기');
  await back();
  await page.click('button.dash-action:has-text("답변 대기 질문")'); await pause(page, 900);
  eq([await page.inputValue('#admin-question-filter'), await page.$$eval('[data-admin-qid]', els => els.map(e => e.dataset.adminQid))], ['waiting', ['q2']], '답변 대기 질문');
  await back();
  await page.click('button.dash-action:has-text("출결 미입력")'); await pause(page, 900);
  eq(await page.inputValue('#quick-session'), 'w4', '출결 미입력 차시');
  await back();
  await page.click('.dash-watch button:has-text("이준호")'); await pause(page, 1200);
  assert((await page.innerText('#student-detail h2')).includes('이준호'), '챙겨 볼 학생 → 학생 상세가 열리지 않음');
});

test('DB04 공개 누락: 3일 안에 수업인데 비공개·예습 꺼짐 → 차시별 학습자료의 그 차시 예습 탭', async b => {
  const seed = makeSeed();
  seed.docs['classes/c1/weeks/w5'].preview.enabled = false;                    // 오늘 수업, 예습 꺼짐
  seed.docs['classes/c1/weeks/w6'].sessionDate = kstDate(Date.now() + 2 * DAY); // 이틀 뒤 수업, 비공개
  const { page } = await openApp(b, { file: 'admin.html', user: 'admin1', seed });
  await pause(page, 1200);
  const card = await page.innerText('.dash-action:has-text("공개 누락")');
  assert(/2\s*개 차시/.test(card), '공개 누락 카드: ' + card);
  await page.click('details[data-action-kind="publish"] summary'); await pause(page, 150);
  const rows = await page.$$eval('details[data-action-kind="publish"] [data-go]', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  assert(rows.length === 2 && rows[0].includes('5차시') && rows[0].includes('예습 꺼짐') && rows[1].includes('6차시') && rows[1].includes('비공개'), '차시별: ' + rows.join(' | '));
  await page.click('details[data-action-kind="publish"] [data-go]:has-text("6차시")'); await pause(page, 900);
  eq([await page.getAttribute('[data-week-open="w6"]', 'aria-current'), await page.getAttribute('[data-week-tab="preview"]', 'aria-pressed')], ['true', 'true'], '열린 차시·탭');
});

test('DB05 대시보드: 0건이면 "처리할 일이 없어요", 문항 분석은 정답률 낮은 문항부터·가장 많이 고른 오답 강조', async b => {
  const seed = makeSeed();
  for (const [path, d] of Object.entries(seed.docs)) {
    if (/\/submissions\/[^/]+$/.test(path)) d.feedbacks = [{ id: 'x', text: '확인', forRevision: 9, createdAt: new Date().toISOString() }];
    if (/\/questions\/[^/]+$/.test(path)) d.status = 'answered';
  }
  seed.docs['classes/c1/weeks/w4/attendance/s2'] = { status: 'absent', note: '' };
  const { page } = await openApp(b, { file: 'admin.html', user: 'admin1', seed });
  await pause(page, 1200);
  assert((await page.innerText('.dash-all-clear')).includes('처리할 일이 없어요'), '0건 안내 없음');
  await page.selectOption('#dash-item-session', 'w1'); await pause(page, 500);
  const meta = await page.innerText('.dash-item-meta');
  assert(meta.includes('첫 응시 2명'), '문항 분석 n: ' + meta);
  // 1차시 첫 응시(버전 1): 김민지 [1],[0,2],[0] · 이준호 [0],[0],[0] → 1번 0/2 · 2번 1/2(복수정답) · 3번 2/2
  const order = await page.$$eval('.dash-item', els => els.map(e => e.querySelector('.dash-item-no').textContent + ' ' + e.querySelector('.dash-item-p').innerText.replace(/\s+/g, ' ')));
  eq(order, ['1번 정답률 0% 0/2명', '2번 정답률 50% 1/2명', '3번 정답률 100% 2/2명'], '정답률 낮은 순');
  assert((await page.innerText('.dash-item:first-child .is-top-wrong')).includes('가장 많이 고른 오답'), '오답 강조 없음');
  assert((await page.innerText('#dash-item-body')).includes('첫 응시를 알 수 없는 이전 기록 1명'), '이전 기록 분리 안내 없음');
});

test('DB06 공개 누락: 만들어 둔 예습이 안 보이는 차시만 셈(예습을 쓰지 않는 차시·빈 편집기·이미지 없는 이미지 모드는 제외)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  const r = await page.evaluate(async () => {
    const { computeDashboard, previewPrepared } = await import('/dashboard.js');
    const c = await import('/common.js?v=test');
    const today = c.todayKey(), day = n => c.todayKey(new Date(Date.now() + n * 86400000));
    const text = html => ({ enabled: false, mode: 'rich', richHtml: html });
    const s = (id, date, published, preview) => ({ id, label: id + '차시', date, published, assignment: { enabled: false }, quiz: { enabled: false, questions: [] }, preview });
    const sessions = [
      s('1', today, true, { enabled: false, mode: 'rich', richHtml: '', imagePath: '', videos: [], files: [] }), // 예습을 쓰지 않음
      s('2', today, true, text('<p>읽어 올 표현</p>')),                                                          // 만든 글이 꺼짐 → 셈
      s('3', day(1), true, text('<p><br></p><div>&nbsp;</div>')),                                               // 편집기에 빈 줄만
      s('4', day(1), true, { enabled: false, mode: 'image', imagePath: '', richHtml: '<p>예전 글</p>' }),        // 이미지 모드인데 이미지 없음
      s('5', day(2), true, { enabled: false, mode: 'image', imagePath: 'classes/c/previews/5/image/a.png' }),    // 이미지가 꺼짐 → 셈
      s('6', day(2), false, { enabled: true, files: [{ path: 'p', name: '단어장.pdf' }] }),                      // 차시 비공개 → 셈
      s('7', day(3), false, { enabled: false, mode: 'rich', richHtml: '' }),                                     // 빈 차시가 비공개(아직 준비 전)
      s('8', day(3), true, { enabled: true, mode: 'rich', richHtml: '<p>공개됨</p>' }),                          // 이미 보임
      s('9', day(5), true, text('<p>멀리 있는 차시</p>')),                                                        // 3일 밖
    ];
    const deps = { sessionState: c.sessionState, wasActiveAt: c.wasActiveAt, reviewState: c.reviewState, needsReply: c.needsReply, attendanceValue: c.attendanceValue, daysBetween: c.daysBetween };
    const d = computeDashboard({ sessions, enrollments: [], events: {}, names: {}, attendance: {}, submissions: {}, quizResults: {}, questions: [] }, today, deps);
    return { publish: d.actions.publish.sessions.map(x => x.id + ':' + x.reason), total: d.actions.total, none: [previewPrepared(null), previewPrepared(undefined), previewPrepared({ title: '제목만' })] };
  });
  eq(r.publish, ['2:예습 꺼짐', '5:예습 꺼짐', '6:비공개'], '공개 누락 차시');
  eq(r.total, 3, '처리할 일 합계');
  eq(r.none, [false, false, false], '예습 없음·제목만');
});

// ----- 배치 10: 학생 동선 · 새 소식 -----
test('ST01 홈: 다음 수업·이번 차시 할 일·새 소식·예습·출석 요약', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 }, tab: 'home' });
  assert((await page.innerText('.home-next')).includes('5차시 · 카페에서 주문하기') && (await page.innerText('.home-next')).includes('오늘'), '다음 수업: ' + await page.innerText('.home-next'));
  const todo = await page.$$eval('.todo-row', rows => rows.map(r => r.innerText.replace(/\s+/g, ' ')));
  assert(todo.length === 3 && todo[0].startsWith('예습') && todo[0].includes('5차시') && todo[1].startsWith('과제') && todo[1].includes('미제출') && todo[1].includes('4차시') && todo[2].startsWith('복습') && todo[2].includes('미응시'), '할 일: ' + todo.join(' | '));
  eq(await page.$$eval('.news-item span:first-child', els => els.map(e => e.textContent)), ['새 피드백 · 2차시 과제', '새 피드백 · 1차시 과제'], '새 소식');
  assert((await page.innerText('.home-attendance')).includes('4 / 4차시 출석'), '출석 요약: ' + await page.innerText('.home-attendance'));
  // 모바일 첫 화면 안에 할 일 카드가 보임
  const top = await page.$eval('.home-todo', el => el.getBoundingClientRect().top);
  assert(top < 844, '할 일 카드가 첫 화면 밖: ' + top);
  await page.click('.news-item:has-text("2차시 과제")'); await pause(page, 900);
  eq([await page.inputValue('#student-week-picker'), await page.$eval('.nav-item.active', el => el.dataset.tab)], ['w2', 'assignment'], '새 소식 → 과제 화면');
});

test('ST02 새 피드백 배지: 강사 피드백 → 과제 탭 배지 → 과제 화면을 보면 사라짐 → 다시 열어도 없음', async b => {
  let r = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 }, tab: 'home' });
  const badge = page => page.$eval('.nav-item[data-tab="assignment"]', el => [el.querySelector('.nav-badge')?.textContent || '', el.getAttribute('aria-label')]);
  eq(await badge(r.page), ['', '과제'], '처음 배지');
  await r.page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s2', { feedbacks: [{ id: 'nf1', text: '문장이 자연스러워요.', audioPath: '', createdAt: new Date().toISOString(), author: '유진', forRevision: 1 }] }));
  await pause(r.page, 600);
  eq(await badge(r.page), ['1', '과제, 새 피드백 1개'], '피드백 도착 후 배지');
  assert((await r.page.innerText('.home-news')).includes('새 피드백 · 1차시 과제'), '홈 새 소식에 없음');
  await r.page.click('.news-item'); await pause(r.page, 1000);
  assert((await r.page.innerText('.student-feedback')).includes('새 피드백'), '과제 화면에 새 피드백 표시가 없음');
  eq(await badge(r.page), ['', '과제'], '확인 후 배지');
  const doc = await dump(r.page, 'classes/c1/weeks/w1/submissions/s2');
  assert(doc.studentSeenFeedbackAt, '확인 시각이 저장되지 않음');
  await r.context.close();
  // 새로 연 화면(새로고침과 같음)에도 배지가 없어야 함: 저장된 문서를 그대로 옮겨 확인
  r = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 }, tab: 'home' });
  await r.page.evaluate(d => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s2', d, { merge: false }), doc);
  await pause(r.page, 600);
  eq(await badge(r.page), ['', '과제'], '다시 열었을 때 배지');
});

test('ST03 과제: 제출한 학생은 "제출한 답안"이 첫 카드, 편집 폼은 [수정해서 다시 제출]을 눌러야 열림', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700);
  const first = await page.$eval('#assignment-area > .card', el => el.innerText);
  assert(first.includes('제출한 답안') && first.includes('Me llamo Minji'), '첫 카드: ' + first.slice(0, 80));
  assert(await page.$eval('#assignment-editor', el => el.classList.contains('hide')), '편집 폼이 처음부터 열려 있음');
  // 피드백은 답안 바로 아래, 최신이 위
  const order = await page.$$eval('#assignment-area > *', els => els.map(e => e.matches('.submitted-card') ? 'answer' : e.id === 'student-assignment-feedback' ? 'feedback' : e.matches('.assignment-brief') ? 'brief' : e.id));
  eq(order, ['answer', 'feedback', 'brief', 'assignment-editor'], '카드 순서');
  await page.click('#edit-assignment'); await pause(page, 300);
  assert(!(await page.$eval('#assignment-editor', el => el.classList.contains('hide'))) && await page.$eval('#edit-assignment', el => el.getAttribute('aria-expanded')) === 'true', '편집 폼이 열리지 않음');
  assert((await page.inputValue('#assignment-text')).includes('Me llamo Minji'), '편집 폼에 기존 답안이 없음');
});

test('ST04 이 피드백에 질문하기: [1차시 과제] 제목 + weekId·context 저장, 강사 질문함에 차시 표시', async b => {
  let r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 } });
  await r.page.selectOption('#student-week-picker', 'w1'); await pause(r.page, 700);
  await r.page.click('[data-ask-feedback]'); await pause(r.page, 200);
  eq(await r.page.inputValue('[data-feedback-question] input[name="title"]'), '[1차시 과제] ', '제목 접두어');
  await r.page.fill('[data-feedback-question] input[name="title"]', '[1차시 과제] 직업 문장 질문');
  await r.page.fill('[data-feedback-question] textarea', '직업 앞에 관사를 빼는 이유가 궁금해요.');
  await r.page.click('[data-feedback-question] button[type="submit"]'); await pause(r.page, 700);
  const qs = await r.page.evaluate(() => window.__mock.list('classes/c1/questions/').filter(p => p.split('/').length === 4).map(p => [p, window.__mock.dump(p)]));
  const mine = qs.find(([, d]) => d.title === '[1차시 과제] 직업 문장 질문');
  assert(mine && mine[1].weekId === 'w1' && mine[1].context === 'assignment' && mine[1].needsTeacherReply === true, '질문 문서: ' + JSON.stringify(mine));
  // 질문 탭의 목록에도 차시 표시
  await r.page.click('[data-tab="questions"]'); await pause(r.page, 600);
  assert((await r.page.innerText('#question-list')).includes('1차시 과제'), '학생 질문 목록에 차시 표시가 없음');
  await r.context.close();
  r = await openAs(b, 'admin.html', 'admin1');
  await r.page.evaluate(([p, d]) => window.__mock.remoteWrite(p, d, { merge: false }), mine);
  await r.page.click('[data-page="questions"]'); await pause(r.page, 700);
  const qid = mine[0].split('/').pop();
  assert((await r.page.innerText(`[data-admin-qid="${qid}"]`)).includes('1차시 과제'), '강사 질문함에 차시 표시가 없음');
  await r.page.click(`[data-admin-qid="${qid}"]`); await pause(r.page, 500);
  assert((await r.page.innerText('#admin-question-detail')).includes('1차시 과제'), '질문 상세에 차시 표시가 없음');
});

test('ST05 복습: 결과 먼저 → 틀린 문제만 다시 풀기는 attempts(mode:wrongOnly)에만 저장, 점수·첫 응시 그대로', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 } });
  await page.click('[data-tab="quiz"]'); await pause(page, 500);
  await page.selectOption('#student-week-picker', 'w1'); await pause(page, 900);
  const summary = await page.innerText('#quiz-content');
  assert(summary.includes('첫 점수 1/3') && summary.includes('지난번에 틀린 문항 2개') && !(await page.$('.answer-option')), '결과 먼저: ' + summary.slice(0, 120));
  const before = await dump(page, 'classes/c1/weeks/w1/quizResults/s2');
  await page.click('#quiz-wrong-only'); await pause(page, 300);
  assert((await page.innerText('.question-count')).includes('틀린 문제 다시 풀기 · QUESTION 1 / 2'), '틀린 문제만 풀기 시작 안 됨');
  await page.click('.answer-option:has-text("좋은 밤 되세요")'); await page.click('#quiz-next'); await pause(page, 200);
  await page.click('.answer-option:has-text("Hola")'); await page.click('.answer-option:has-text("Buenos días")'); await page.click('#quiz-next'); await pause(page, 900);
  const result = await page.innerText('#quiz-content');
  assert(result.includes('지난번 틀린 2문항 중 2문항 정답') && result.includes('지난번에 틀린 문항을 이번에 맞혔어요'), '연습 결과: ' + result.slice(0, 160));
  const after = await dump(page, 'classes/c1/weeks/w1/quizResults/s2');
  eq([after.score, after.total, after.attemptCount, JSON.stringify(after.firstAttempt)], [before.score, before.total, before.attemptCount, JSON.stringify(before.firstAttempt)], '요약 문서(점수·첫 응시)');
  const attempts = await page.evaluate(() => window.__mock.list('classes/c1/weeks/w1/quizResults/s2/attempts/').map(p => window.__mock.dump(p)));
  const practice = attempts.find(a => a.mode === 'wrongOnly');
  assert(practice && practice.score === 2 && practice.total === 2 && JSON.stringify(practice.questionIds) === JSON.stringify(['q11', 'q12']) && JSON.stringify(practice.answersById.q12) === '[0,2]', '연습 기록: ' + JSON.stringify(practice));
  await page.click('#quiz-back-summary'); await pause(page, 900);
  const again = await page.innerText('#quiz-content');
  assert(again.includes('틀린 문제 연습 · 2문항 중 2문항 정답') && !(await page.$('#quiz-wrong-only')), '연습 뒤 결과 요약: ' + again.slice(0, 200));
});

test('ST06 320px: 하단 메뉴 라벨 12px 이상, 잘리지 않음, 활성 메뉴는 색 + 굵기 + 표시선', async b => {
  const { page } = await openAs(b, 'index.html', 's1', { viewport: { width: 320, height: 640 }, tab: 'home' });
  const labels = await page.$$eval('.nav-label', els => els.map(e => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize), cut: e.scrollWidth > e.clientWidth + 0.5 })));
  assert(labels.length === 5 && labels.every(l => l.size >= 12 && !l.cut), '라벨: ' + JSON.stringify(labels));
  const active = await page.$eval('.nav-item.active', el => ({ weight: getComputedStyle(el).fontWeight, bar: getComputedStyle(el, '::before').content !== 'none', current: el.getAttribute('aria-current') }));
  assert(Number(active.weight) >= 800 && active.bar && active.current === 'page', '활성 메뉴: ' + JSON.stringify(active));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 0, '가로 넘침: ' + overflow);
});

test('ST07 강사 사이드바 배지: 질문함 = 답변 대기, 과제·복습 관리 = 피드백 대기 + 재검토 대기(대시보드와 같은 기준)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await pause(page, 600);
  const side = key => page.$eval(`.side-link[data-page="${key}"]`, el => [el.querySelector('.side-badge')?.textContent || '', el.querySelector('.side-badge-text')?.textContent || '']);
  eq(await side('questions'), ['1', ', 답변 대기 질문 1건'], '질문함 배지');
  eq(await side('feedback'), ['4', ', 피드백·재검토 대기 4건'], '과제·복습 관리 배지');
  // 강사가 피드백을 남기면 줄어듦
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w1/submissions/s2', { feedbacks: [{ id: 'x1', text: '좋아요', createdAt: new Date().toISOString(), forRevision: 1 }] }));
  await pause(page, 500);
  eq((await side('feedback'))[0], '3', '피드백 뒤 배지');
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/questions/q2', { status: 'answered', needsTeacherReply: false }));
  await pause(page, 500);
  eq(await side('questions'), ['', ''], '답변 뒤 질문함 배지');
});

test('ST08 강사 응시 기록: 틀린 문제 연습은 "틀린 문제 다시 풀기"로 따로 표시, 그 문항만 보여 줌', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.evaluate(() => window.__mock.remoteWrite('classes/c1/weeks/w1/quizResults/s2/attempts/p1', { userId: 's2', answers: ['2', '0,2'], answersById: { q11: [2], q12: [0, 2] }, questionIds: ['q11', 'q12'], quizVersion: 1, score: 2, total: 2, attemptNumber: 1, mode: 'wrongOnly', submittedAt: window.__mock.ts(Date.now()) }));
  await page.click('[data-page="feedback"]'); await pause(page, 500);
  await page.click('[data-feedback-tab="quizResults"]'); await pause(page, 500);
  await page.selectOption('#admin-week-picker', 'w1'); await pause(page, 700);
  await page.click('[data-feedback-uid="s2"]'); await pause(page, 400);
  await page.click('[data-attempt-history] > summary'); await pause(page, 700);
  const rows = await page.$$eval('[data-attempt-content] > details', els => els.map(e => e.querySelector('summary').innerText.replace(/\s+/g, ' ')));
  assert(rows.length === 2 && rows[0].includes('1번째 응시') && rows[1].includes('틀린 문제 다시 풀기') && rows[1].includes('연습 2/2'), '응시 기록: ' + rows.join(' | '));
  await page.click('[data-attempt-content] > details:nth-child(2) > summary'); await pause(page, 200);
  const lines = await page.$$eval('[data-attempt-content] > details:nth-child(2) p.hint', els => els.length);
  assert(lines === 3, '연습 문항 수(설명 1줄 + 문항 2줄): ' + lines);
});

// ----- 배치 11: 학생 상세 · 수강생 관리 -----
const openRoster = async page => { await page.click('[data-page="classes"]'); await pause(page, 400); await page.click('[data-open-roster="c1"]'); await pause(page, 1100); };
test('SP01 학생 상세: 이름을 누르면 패널이 열리고 기본 정보·최근 차시·과제·복습·질문·강사 메모가 가상 데이터와 일치', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await openRoster(page);
  await page.click('[data-open-detail="s2"]'); await pause(page, 1200);
  const text = await page.innerText('#student-detail');
  for (const want of ['이준호', 'junho@example.com', '스페인어 기초반 2기', '수강 중', '최근 4차시', '숫자 15와 50 발음이 헷갈려요', '답변 대기', '강사만 볼 수 있어요', '학생 홈에 보여요'])
    assert(text.includes(want), `상세에 '${want}'이(가) 없음`);
  // 최근 차시 기호: 출결 ● ● ○ · / 과제 ✓ ✕ ✕ ✕ / 복습 첫 응시 33% 미응시 …
  const row = name => page.$$eval(`#student-detail .detail-grid tbody tr`, (trs, n) => { const tr = trs.find(t => t.querySelector('th').textContent === n); return [...tr.querySelectorAll('td')].map(td => td.innerText.trim().split('\n')[0]); }, name);
  eq(await row('출결'), ['●', '●', '○', '·'], '출결 기호');
  eq(await row('과제'), ['✓', '✕', '✕', '✕'], '과제 기호');
  eq(await row('복습 첫 응시'), ['33%', '미응시', '미응시', '미응시'], '복습 첫 응시');
  const quiz = await page.$$eval('#student-detail .detail-table tbody tr', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  assert(quiz.includes('1차시 1/3 · 33% 1/3 · 33% 1회'), '복습 표: ' + quiz.join(' | '));
  assert((await page.inputValue('#detail-memo-text')).includes('출장이 잦아'), '강사 메모 내용');
  assert(await page.$eval('[data-roster-row="s2"]', tr => tr.classList.contains('is-selected')) && await page.$('[data-roster-row="s2"] .memo-flag'), '목록의 선택 표시·메모 표시');
  // 제출 보기 → 과제·복습 관리의 그 차시·학생
  await page.click('#student-detail [data-go-feedback="w1"]'); await pause(page, 1000);
  eq([await page.inputValue('#admin-week-picker'), await page.$eval('[data-feedback-uid="s2"]', el => el.classList.contains('selected'))], ['w1', true], '제출 보기 이동');
});

test('SP02 강사 메모: 상세에서 고쳐 저장(Ctrl+Enter)하고, 학생 화면 어디에도 메모가 보이지 않음', async b => {
  let r = await openAs(b, 'admin.html', 'admin1');
  await openRoster(r.page);
  await r.page.click('[data-open-detail="s1"]'); await pause(r.page, 1100);
  assert(!(await r.page.$('[data-roster-row="s1"] .memo-flag')), '메모가 없는데 표시됨');
  await r.page.fill('#detail-memo-text', '발음 연습을 좋아함. 비밀 메모 테스트');
  await r.page.keyboard.press('Control+Enter'); await pause(r.page, 700);
  eq((await dump(r.page, 'classes/c1/teacherNotes/s1'))?.text, '발음 연습을 좋아함. 비밀 메모 테스트', '저장된 메모');
  assert(await r.page.$('[data-roster-row="s1"] .memo-flag'), '저장 뒤 목록에 메모 표시가 없음');
  const note = await dump(r.page, 'classes/c1/teacherNotes/s1');
  await r.context.close();
  r = await openAs(b, 'index.html', 's1', { viewport: { width: 390, height: 844 }, tab: 'home' });
  await r.page.evaluate(d => window.__mock.remoteWrite('classes/c1/teacherNotes/s1', d, { merge: false }), note);
  for (const tab of ['home', 'assignment', 'quiz', 'questions', 'mypage']) {
    await r.page.click(`[data-tab="${tab}"]`); await pause(r.page, 700);
    assert(!(await r.page.innerText('#student-body')).includes('비밀 메모'), `학생 ${tab} 화면에 강사 메모가 보임`);
  }
});

test('SP03 ⋯ 메뉴: Enter로 열고 ↓↑로 이동, Esc로 닫으면 버튼으로 돌아감 · 메뉴의 출석현황은 기존 모달', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await openRoster(page);
  await page.focus('[data-row-menu="s1"]');
  await page.keyboard.press('Enter'); await pause(page, 150);
  assert(await page.$eval('[data-row-menu="s1"]', el => el.getAttribute('aria-expanded')) === 'true', '메뉴가 열리지 않음');
  const focused = () => page.evaluate(() => document.activeElement?.textContent);
  eq(await focused(), '학생 상세 보기', '첫 항목 포커스');
  await page.keyboard.press('ArrowDown'); eq(await focused(), '출석현황', '↓');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); eq(await focused(), '수강 중지', '↑ 처음에서 마지막으로');
  await page.keyboard.press('Escape'); await pause(page, 100);
  assert(!(await page.$('.row-menu')) && await page.evaluate(() => document.activeElement?.dataset.rowMenu) === 's1', 'Esc 뒤 메뉴 닫힘·포커스 복귀');
  await rowAction(page, 's1', 'data-student-attendance'); await pause(page, 900);
  assert((await page.innerText('.student-attendance-modal')).includes('김민지 · 출석현황'), '출석현황 모달');
});

test('SP04 다음 학습 목표: 강사가 상세에서 저장 → 그 학생 홈에 표시', async b => {
  let r = await openAs(b, 'admin.html', 'admin1');
  await openRoster(r.page);
  await r.page.click('[data-open-detail="s2"]'); await pause(r.page, 1100);
  await r.page.fill('#detail-goal-text', '다음 과제에서는 연결 표현(pero, porque)을 2개 써 보기');
  await r.page.click('#detail-goal-save'); await pause(r.page, 600);
  const goal = await dump(r.page, 'classes/c1/studentGoals/s2');
  assert(goal?.text?.includes('pero, porque') && goal.updatedBy === 'admin1', '저장된 목표: ' + JSON.stringify(goal));
  await r.context.close();
  r = await openAs(b, 'index.html', 's2', { viewport: { width: 390, height: 844 }, tab: 'home' });
  await r.page.evaluate(d => window.__mock.remoteWrite('classes/c1/studentGoals/s2', d, { merge: false }), goal);
  await r.page.click('[data-tab="mypage"]'); await pause(r.page, 500);
  await r.page.click('[data-tab="home"]'); await pause(r.page, 900);
  assert((await r.page.innerText('.home-goal')).includes('pero, porque'), '학생 홈에 목표가 없음');
});

test('SP05 390px: 수강생 관리는 카드형 목록, 가로 넘침 없음, 상세는 전체 화면 + [← 목록]', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1', { viewport: { width: 390, height: 844 } });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(await overflow() <= 0, '대시보드 가로 넘침: ' + await overflow());
  await openRoster(page);
  assert(await overflow() <= 0, '수강생 관리 가로 넘침: ' + await overflow());
  assert(await page.$eval('.roster-table tr[data-roster-row]', tr => getComputedStyle(tr).display === 'grid'), '카드형 목록이 아님');
  await page.click('[data-open-detail="s1"]'); await pause(page, 1100);
  const box = await page.$eval('#student-detail', el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; });
  eq(box, [0, 0, 390], '상세가 전체 화면이 아님');
  await page.click('#student-detail .detail-back'); await pause(page, 300);
  assert(await page.$eval('#student-detail', el => el.hidden) && await page.evaluate(() => document.activeElement?.dataset.openDetail) === 's1', '[← 목록] 뒤 목록으로 돌아가지 않음');
});

// ----- 배치 12: 접근성 -----
// 키보드만으로: Tab을 눌러 원하는 요소까지 이동합니다(마우스 클릭 없음).
async function tabTo(page, selector, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(sel => !!document.activeElement?.matches(sel), selector)) return;
  }
  throw new Error('키보드로 닿지 못함: ' + selector);
}
test('A11Y01 키보드만으로 학생 과제 제출 (Tab · 화살표 · Enter)', async b => {
  const { page } = await openAs(b, 'index.html', 's2', { viewport: { width: 1280, height: 900 }, tab: 'home' });
  await tabTo(page, '.nav-item[data-tab="assignment"]'); await page.keyboard.press('Enter'); await pause(page, 700);
  await tabTo(page, '#student-week-picker');
  for (let i = 0; i < 15 && (await page.inputValue('#student-week-picker')) !== 'w4'; i++) { await page.keyboard.press('ArrowUp'); await pause(page, 300); } // 처음 선택은 마지막 공개 차시(5차시)
  assert((await page.inputValue('#student-week-picker')) === 'w4' && await page.evaluate(() => document.activeElement?.id) === 'student-week-picker', '키보드로 차시를 고르지 못함(포커스 유지)');
  await pause(page, 600);
  await tabTo(page, '#assignment-text'); await page.keyboard.type('Mi hermana tiene diez años.');
  await tabTo(page, '#submit-assignment'); await page.keyboard.press('Enter'); await pause(page, 1000);
  assert((await dump(page, 'classes/c1/weeks/w4/submissions/s2'))?.text === 'Mi hermana tiene diez años.', '키보드로 제출되지 않음');
});

test('A11Y02 키보드만으로 강사 피드백 등록 (사이드바 · 차시 선택 · 학생 · 피드백 저장)', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await tabTo(page, '.side-link[data-page="feedback"]'); await page.keyboard.press('Enter'); await pause(page, 800);
  await tabTo(page, '#admin-week-picker');
  for (let i = 0; i < 15 && (await page.inputValue('#admin-week-picker')) !== 'w1'; i++) { await page.keyboard.press('ArrowUp'); await pause(page, 400); }
  assert((await page.inputValue('#admin-week-picker')) === 'w1', '키보드로 차시를 고르지 못함');
  await pause(page, 800);
  await tabTo(page, '[data-feedback-uid="s2"]'); await page.keyboard.press('Enter'); await pause(page, 500);
  await tabTo(page, '[data-feedback-text]'); await page.keyboard.type('Muy bien. 다음에는 가족 이름도 넣어 볼까요?');
  await tabTo(page, '[data-feedback-save]'); await page.keyboard.press('Enter'); await pause(page, 900);
  const fb = (await dump(page, 'classes/c1/weeks/w1/submissions/s2')).feedbacks || [];
  assert(fb.some(f => f.text.includes('가족 이름')), '키보드로 피드백이 저장되지 않음');
});

test('A11Y03 긴 이름·긴 스페인어 문장·확대(좁은 폭)에서도 가로로 넘치지 않음', async b => {
  const seed = makeSeed();
  const long = '마리아 페르난다 가르시아 로페스 데 라 크루스 산티아고';
  Object.assign(seed.docs['users/s1'], { realName: long, displayName: long });
  seed.docs['enrollments/s1_c1'].studentName = long;
  seed.docs['classes/c1/members/s1'].name = long;
  seed.docs['classes/c1/weeks/w1/submissions/s1'].text = 'Supercalifragilisticoespialidosoysiempremuyfelizdeaprenderespañolcontodosmisamigos '.repeat(3);
  for (const [file, user, width, tab] of [['index.html', 's1', 320, 'assignment'], ['admin.html', 'admin1', 640, null]]) {
    const { page, context } = await openApp(b, { file, user, seed, viewport: { width, height: 800 } });
    await pause(page, 900);
    if (tab) { await page.click(`[data-tab="${tab}"]`); await pause(page, 500); await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700); }
    else { await page.click('[data-page="classes"]'); await pause(page, 400); await page.click('[data-open-roster="c1"]'); await pause(page, 1000); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 0, `${file} ${width}px 가로 넘침 ${overflow}px`);
    await context.close();
  }
});

test('A11Y04 소제목: 승인한 스페인어로 통일(영어 없음) · 스페인어 글자에는 lang="es"', async () => {
  const fsx = require('node:fs'), pathx = require('node:path');
  const src = ['index.html', 'admin.html', 'common.js'].map(n => fsx.readFileSync(pathx.join(__dirname, '..', n), 'utf8')).join('\n');
  const tags = [...src.matchAll(/<(p|div|span) class="(?:eyebrow|kicker)"([^>]*)>(.*?)<\/\1>/g)].map(m => ({ attrs: m[2], inner: m[3], text: m[3].replace(/<[^>]*>/g, '') }));
  assert(tags.length >= 20, '소제목 수: ' + tags.length);
  const latin = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü¡¿]/;
  eq(tags.filter(t => latin.test(t.text) && !/lang="es"/.test(t.attrs) && !t.inner.includes('<span lang="es">')).map(t => t.text), [], 'lang="es"가 없는 스페인어 소제목');
  eq(tags.filter(t => /\b(LEARNING|JOURNEY|CLASS|INSIGHTS|MANAGEMENT|SCHEDULE|LESSON|PLANNER|FEEDBACK|STUDENT|DIRECTORY|INSTRUCTOR|WORKSPACE|WELCOME|ACCESS|CONTROL|QUIZ|COMPLETE)\b/i.test(t.text)).map(t => t.text), [], '영어 소제목');
});

// ----- 2026-10-29 추가: 복습 수업 영상 · 공지사항 (v4 규칙) -----
const RECAP = { enabled: true, videos: [{ kind: 'upload', path: 'classes/c1/recaps/w4/video/class4.mp4', name: 'class4.mp4', size: 734003200 }, { kind: 'youtube', videoId: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ', name: '유튜브 영상 (dQw4w9WgXcQ)' }] };
const recapSeed = () => { const seed = makeSeed(); seed.docs['classes/c1/weeks/w4'].recap = JSON.parse(JSON.stringify(RECAP)); seed.files['classes/c1/recaps/w4/video/class4.mp4'] = 'video'; return seed; };
const HOUR = 3600 * 1000;
const noticeSeed = () => {
  const seed = makeSeed(), at = h => new Date(Date.now() - h * HOUR).toISOString();
  const n = (id, title, body, pinned, hoursAgo) => { seed.docs[`classes/c1/notices/${id}`] = { title, body, pinned, createdAt: at(hoursAgo), updatedAt: at(hoursAgo), createdBy: 'admin1', authorName: '유진' }; };
  n('n1', '교재는 3과까지 준비해 주세요', '교재: 「Hola 스페인어」\n서점: https://example.com/book', true, 240);
  n('n2', '11월 5일 수업은 쉽니다', '보강은 11월 12일(목)입니다.', false, 1);
  n('n3', '단어 시험 범위 안내', '1~3차시 단어', false, 120);
  seed.docs['classes/c1/noticeReads/s1'] = { seenAt: at(48) }; // 이틀 전에 공지 화면을 봄 → n2만 새 공지
  return seed;
};

test('RC01 복습 수업 영상(강사): 복습 탭에 영상 올리기 · 유튜브 링크 · 영상 없이 켜면 안내 · 저장 경로', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1', { rules: 'v4' });
  await page.click('[data-page="weeks"]'); await pause(page, 500);
  await page.click('[data-week-open="w4"]'); await pause(page, 400);
  await page.click('[data-week-tab="quiz"]'); await pause(page, 200);
  const order = await page.$$eval('[data-week-panel="quiz"] h3', els => els.map(e => e.textContent.trim()));
  eq(order, ['🎬 수업 영상', '📝 복습 퀴즈'], '복습 탭 순서');
  await page.click('label.switch:has(#recap-enabled)');
  await page.click('#save-week'); await pause(page, 400);
  assert((await lastToast(page)).includes('수업 영상을 공개하려면'), '영상 없이 켠 채 저장됨: ' + await lastToast(page));
  await page.setInputFiles('#recap-video-file', { name: 'class4.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-video') }); await pause(page, 500);
  await page.fill('#recap-video-link', 'https://youtu.be/dQw4w9WgXcQ'); await page.click('#add-recap-link'); await pause(page, 200);
  const list = await page.innerText('#recap-videos-list');
  assert(list.includes('class4.mp4') && list.includes('직접 업로드') && list.includes('유튜브 링크'), '수업 영상 목록: ' + list);
  assert((await page.innerText('#week-visibility')).includes('수업 영상 ✓'), '공개 범위 요약: ' + await page.innerText('#week-visibility'));
  assert((await page.innerText('#week-save-status')).includes('저장하지 않은 변경'), '저장 전 표시 없음');
  await page.click('#save-week'); await pause(page, 900);
  const recap = (await dump(page, 'classes/c1/weeks/w4')).recap;
  assert(recap.enabled === true && recap.videos.length === 2, '저장 형식: ' + JSON.stringify(recap));
  assert(/^classes\/c1\/recaps\/w4\/video\/.+class4\.mp4$/.test(recap.videos[0].path) && recap.videos[0].kind === 'upload' && recap.videos[1].kind === 'youtube', '영상 경로·종류: ' + JSON.stringify(recap.videos));
  // 영상을 지우고 저장하면 Storage 파일도 정리
  await page.click('[data-week-tab="quiz"]'); await pause(page, 200);
  await page.click('[data-remove-recap="0"]'); await pause(page, 100);
  await page.click('#save-week'); await pause(page, 900);
  assert((await page.evaluate(() => window.__mock.deletedFiles())).includes(recap.videos[0].path), '지운 영상 파일이 남음');
});

test('RC02 복습 수업 영상(학생): 홈 할 일 → 수업 영상 화면, 퀴즈와 다른 화면으로 전환, 메뉴로 다시 와도 고른 화면 유지', async b => {
  const { page, errors } = await openApp(b, { file: 'index.html', user: 's1', rules: 'v4', seed: recapSeed(), viewport: { width: 390, height: 844 } });
  await pause(page, 900);
  const row = page.locator('.todo-row', { hasText: '수업 영상' });
  assert((await row.innerText()).includes('영상 2개'), '할 일에 수업 영상 없음: ' + await page.innerText('.home-todo'));
  await row.locator('[data-view="video"]').click(); await pause(page, 600);
  assert(await page.$('.review-tabs [data-review-view="video"][aria-pressed="true"]'), '수업 영상 탭이 선택되지 않음');
  // 모의 저장소는 영상 파일 주소를 비워 두므로, 영상 칸 수와 직접 올린 영상의 주소 요청으로 확인합니다.
  eq(await page.$$eval('.recap-card .lesson-video-block strong', els => els.map(e => e.textContent)), ['수업 영상 1', '수업 영상 2'], '수업 영상 칸');
  assert((await page.evaluate(() => window.__mock.urlRequests())).includes('classes/c1/recaps/w4/video/class4.mp4'), '직접 올린 영상 주소를 요청하지 않음');
  assert((await page.getAttribute('.recap-card iframe', 'src')) === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0', '유튜브 임베드 주소');
  assert(!(await page.$('#quiz-stage')), '영상 화면에 퀴즈가 함께 보임');
  await page.click('.review-tabs [data-review-view="quiz"]'); await pause(page, 600);
  assert(await page.$('#quiz-stage') && !(await page.$('.recap-card')), '퀴즈 화면으로 바뀌지 않음');
  assert(await page.evaluate(() => document.activeElement?.dataset.reviewView === 'quiz'), '화면을 바꾼 뒤 포커스가 탭에 없음');
  await page.click('[data-tab="home"]'); await pause(page, 500);
  await page.click('[data-tab="quiz"]'); await pause(page, 600);
  assert(await page.$('#quiz-stage'), '메뉴로 다시 왔을 때 고른 화면(퀴즈)이 유지되지 않음');
  await page.click('.review-tabs [data-review-view="video"]'); await pause(page, 500);
  await page.click('.recap-card [data-review-view="quiz"]'); await pause(page, 500);
  assert(await page.$('#quiz-stage'), '영상 화면의 "복습 퀴즈 풀러 가기"가 동작하지 않음');
  // 수업 영상이 없는 차시는 탭 없이 퀴즈만
  await page.selectOption('#student-week-picker', 'w3'); await pause(page, 600);
  assert(!(await page.$('.review-tabs')) && await page.$('#quiz-stage'), '영상 없는 차시에 탭이 보임');
  assert(!errors.length, '오류: ' + errors.join(' | '));
});

test('RC03 복습 수업 영상: 보관된 반에서는 영상 대신 안내만, 영상 주소도 요청하지 않음', async b => {
  const seed = makeSeed();
  seed.docs['classes/c3/weeks/ow1'].recap = { enabled: true, videos: [{ kind: 'upload', path: 'classes/c3/recaps/ow1/video/c.mp4', name: 'c.mp4', size: 1 }, { kind: 'youtube', videoId: 'dQw4w9WgXcQ', url: '', name: '유튜브' }] };
  seed.files['classes/c3/recaps/ow1/video/c.mp4'] = 'video';
  const { page } = await openApp(b, { file: 'index.html', user: 's5', rules: 'v4', seed, viewport: { width: 390, height: 844 } });
  await pause(page, 900);
  await page.click('[data-past-class="c3"]'); await pause(page, 700);
  await page.selectOption('#student-week-picker', 'ow1'); await pause(page, 400);
  await page.click('[data-tab="quiz"]'); await pause(page, 600);
  assert((await page.innerText('.review-past-note')).includes('수업 영상 2개는 수강 기간에만'), '지난 반 안내 없음');
  assert(!(await page.$('.review-tabs')) && !(await page.$('video')) && !(await page.$('iframe')), '지난 반에 수업 영상이 보임');
  assert(await page.$('#quiz-content'), '지난 반 복습 연습이 사라짐');
  const asked = (await page.evaluate(() => window.__mock.urlRequests())).filter(x => x.includes('/recaps/'));
  assert(!asked.length, '수업 영상 주소를 요청함: ' + asked.join(','));
});

test('NT01 공지사항(강사): 올리기·수정·상단 고정·삭제, 쓰던 내용이 있으면 닫기 전에 확인', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1', { rules: 'v4' });
  await page.click('[data-page="notices"]'); await pause(page, 600);
  assert((await page.innerText('#notice-admin-list')).includes('아직 올린 공지가 없어요'), '빈 목록 안내 없음');
  await page.click('#notice-new'); await pause(page, 200);
  assert(await page.evaluate(() => document.activeElement?.id === 'notice-title'), '작성 창을 열면 제목에 포커스가 없음');
  await page.click('#notice-save'); await pause(page, 200);
  assert((await page.innerText('#notice-error')).includes('제목을 입력'), '제목 없이 저장됨');
  await page.fill('#notice-title', '11월 5일 수업은 쉽니다');
  await page.fill('#notice-body', '보강은 11월 12일입니다.\n자료: https://example.com/a.pdf.');
  await page.click('#notice-cancel'); await pause(page, 200);
  assert(await page.$('.app-modal-ok'), '쓰던 내용이 있는데 바로 닫힘');
  await page.click('.app-modal-cancel'); await pause(page, 200);
  assert(await page.$('#notice-form'), '닫기를 취소했는데 작성 창이 사라짐');
  await page.click('#notice-save'); await pause(page, 700);
  const ids = await page.evaluate(() => window.__mock.list('classes/c1/notices/'));
  assert(ids.length === 1, '공지 문서: ' + ids.join(','));
  const saved = await dump(page, ids[0]);
  assert(saved.title === '11월 5일 수업은 쉽니다' && saved.pinned === false && saved.createdBy === 'admin1', '저장 내용: ' + JSON.stringify(saved));
  assert((await page.getAttribute('.announce-body a', 'href')) === 'https://example.com/a.pdf', '본문 주소 링크(끝 마침표 제외)');
  assert(/읽음 0\/\d+명/.test(await page.innerText('.announce-reads')), '읽음 수: ' + await page.innerText('.announce-reads'));
  // 수정
  await page.click('[data-notice-edit]'); await pause(page, 200);
  assert((await page.inputValue('#notice-title')) === '11월 5일 수업은 쉽니다', '수정 창에 기존 제목이 없음');
  await page.fill('#notice-title', '11월 5일(수) 휴강'); await page.click('#notice-save'); await pause(page, 600);
  assert((await dump(page, ids[0])).title === '11월 5일(수) 휴강', '수정이 저장되지 않음');
  // 상단 고정: 다시 그린 뒤에도 누른 버튼에 포커스
  await page.click('[data-notice-pin]'); await pause(page, 600);
  assert((await dump(page, ids[0])).pinned === true && (await page.innerText('.announce-card')).includes('상단 고정'), '고정되지 않음');
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-notice-pin')), '고정 뒤 포커스를 잃음');
  // 삭제
  await page.click('[data-notice-delete]'); await pause(page, 200); await ok(page);
  assert(!(await dump(page, ids[0])) && (await page.innerText('#notice-admin-list')).includes('아직 올린 공지가 없어요'), '삭제되지 않음');
});

test('NT02 공지사항(학생): 홈 맨 위에 고정·새 공지, 홈 배지, 공지 화면을 열면 확인 시각 기록 → 새 공지 표시 사라짐', async b => {
  const { page, errors } = await openApp(b, { file: 'index.html', user: 's1', rules: 'v4', seed: noticeSeed(), viewport: { width: 390, height: 844 } });
  await pause(page, 900);
  const rows = await page.$$eval('.home-notices .announce-row', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  assert(rows.length === 2 && rows[0].includes('상단 고정') && rows[0].includes('교재는 3과까지') && rows[1].includes('새 공지') && rows[1].includes('11월 5일 수업은 쉽니다'), '홈 공지: ' + rows.join(' | '));
  assert(!rows.some(r => r.includes('단어 시험')), '이미 본 공지가 홈 맨 위에 보임');
  assert((await page.getAttribute('.nav-item[data-tab="home"]', 'aria-label')) === '홈, 새 공지 1개', '홈 배지: ' + await page.getAttribute('.nav-item[data-tab="home"]', 'aria-label'));
  const firstCard = await page.$eval('#home-main', el => el.firstElementChild.className);
  assert(firstCard.includes('home-notices'), '공지 카드가 홈 맨 위가 아님: ' + firstCard);
  await page.evaluate(() => window.__mock.clearWrites());
  await page.click('.announce-row:has-text("11월 5일")'); await pause(page, 700);
  const titles = await page.$$eval('.announce-item h2', els => els.map(e => e.textContent));
  eq(titles, ['교재는 3과까지 준비해 주세요', '11월 5일 수업은 쉽니다', '단어 시험 범위 안내'], '공지 순서(고정 → 최근)');
  assert(await page.evaluate(() => document.activeElement?.id === 'notice-n2'), '누른 공지로 이동하지 않음');
  assert((await page.innerText('#notice-n2')).includes('새 공지'), '보는 동안 새 공지 표시가 바로 사라짐');
  assert((await page.getAttribute('#notice-n1 .announce-body a', 'target')) === '_blank', '본문 링크가 새 탭이 아님');
  const writes = await page.evaluate(() => window.__mock.writes().filter(w => w.source === 'local').map(w => w.path));
  eq(writes, ['classes/c1/noticeReads/s1'], '확인 시각 기록');
  assert((await page.getAttribute('.nav-item[data-tab="home"]', 'aria-label')) === '홈', '확인 뒤에도 홈 배지가 남음');
  await page.click('#notices-back'); await pause(page, 600);
  const after = await page.$$eval('.home-notices .announce-row', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  assert(after.length === 1 && after[0].includes('상단 고정'), '확인 뒤 홈 공지: ' + after.join(' | '));
  assert(!errors.length, '오류: ' + errors.join(' | '));
});

test('NT03 공지사항: 강사 화면의 읽음 수와 안 읽은 학생', async b => {
  const seed = noticeSeed();
  seed.docs['classes/c1/noticeReads/s1'] = { seenAt: new Date().toISOString() }; // s1은 모든 공지를 봄
  const active = Object.entries(seed.docs).filter(([p, d]) => /^enrollments\/[^/]+$/.test(p) && d.classId === 'c1' && d.status === 'active').length;
  const { page } = await openApp(b, { file: 'admin.html', user: 'admin1', rules: 'v4', seed });
  await pause(page, 900);
  await page.click('[data-page="notices"]'); await pause(page, 900);
  const reads = await page.$$eval('.announce-reads > .hint', els => els.map(e => e.textContent));
  eq(reads, Array(3).fill(`읽음 1/${active}명`), '공지별 읽음 수');
  assert((await page.innerText('.announce-unread summary')).includes(`안 읽은 학생 ${active - 1}명`), '안 읽은 학생 수');
});

test('NT04 공지사항: 보관된 반은 지난 반 안내 줄에서 읽기만(확인 시각을 쓰지 않음)', async b => {
  const seed = makeSeed();
  seed.docs['classes/c3/notices/p1'] = { title: '수료 안내', body: '수료증은 메일로 보내 드려요.', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'admin1', authorName: '유진' };
  const { page } = await openApp(b, { file: 'index.html', user: 's5', rules: 'v4', seed, viewport: { width: 390, height: 844 } });
  await pause(page, 900);
  await page.click('[data-past-class="c3"]'); await pause(page, 700);
  await page.evaluate(() => window.__mock.clearWrites());
  await page.click('#past-notices'); await pause(page, 700);
  assert((await page.innerText('#announce-feed')).includes('수료 안내') && !(await page.innerText('#announce-feed')).includes('새 공지'), '지난 반 공지: ' + await page.innerText('#announce-feed'));
  const writes = await page.evaluate(() => window.__mock.writes().filter(w => w.source === 'local'));
  assert(!writes.length, '지난 반에서 확인 시각을 씀: ' + JSON.stringify(writes));
  await page.click('#notices-back'); await pause(page, 500);
  assert(await page.$('.past-banner') && await page.$('[data-tab="assignment"][aria-current="page"]'), '돌아가기 후 지난 반 과제 화면이 아님');
});

test('NT05 공지사항: 공지 규칙을 게시하기 전(v3)에도 학생 홈은 그대로, 강사 공지 화면은 권한 안내', async b => {
  let r = await openApp(b, { file: 'index.html', user: 's1', rules: 'v3', seed: noticeSeed(), viewport: { width: 390, height: 844 } });
  await pause(r.page, 900);
  assert(!(await r.page.$('.home-notices')) && await r.page.$('.home-next'), '규칙 게시 전 홈이 달라짐');
  assert((await r.page.getAttribute('.nav-item[data-tab="home"]', 'aria-label')) === '홈', '규칙 게시 전 홈 배지가 뜸');
  assert(!r.errors.length, '학생 오류: ' + r.errors.join(' | '));
  await r.context.close();
  r = await openApp(b, { file: 'admin.html', user: 'admin1', rules: 'v3', seed: noticeSeed() });
  await pause(r.page, 900);
  await r.page.click('[data-page="notices"]'); await pause(r.page, 700);
  assert((await r.page.innerText('#notice-admin-list')).includes('보안 규칙'), '강사 화면 권한 안내: ' + await r.page.innerText('#notice-admin-list'));
});

test('CP01 수강 코드 복사: 안내문 없이 코드만 복사하고, 버튼 이름에 코드와 동작을 밝힘', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 500);
  await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); }; });
  assert((await page.getAttribute('[data-copy-class="c1"]', 'aria-label')) === '수강 코드 HOLA2026 복사', '버튼 이름: ' + await page.getAttribute('[data-copy-class="c1"]', 'aria-label'));
  await page.click('[data-copy-class="c1"]'); await pause(page, 300);
  eq(await page.evaluate(() => window.__copied), ['HOLA2026'], '복사한 글자');
  assert((await lastToast(page)).includes('HOLA2026'), '복사 안내: ' + await lastToast(page));
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
