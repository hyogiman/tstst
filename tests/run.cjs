// 시나리오 테스트: node tests/run.cjs [이름필터]
// 모의 Firebase 위에서 배치별 수정이 실제로 동작하는지 확인합니다.
// 규칙 흉내: 'v1'(처음 받은 규칙) · 'v2'(2026-10-29 게시) · 'v3'(이번 수정안). 기본은 v3.
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
  const r = await openApp(browser, { file, user, rules: opts.rules || 'v3', viewport: opts.viewport || { width: 1280, height: 900 } });
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

test('B04b 반 이동(강사가 새 반 등록 생성) — v1 규칙에서는 친절한 오류, v2 이후 규칙에서는 성공', async b => {
  for (const rules of ['v1', 'v2']) {
    const { page } = await openAs(b, 'admin.html', 'admin1', { rules });
    await page.click('[data-page="classes"]'); await pause(page, 400);
    await page.click('[data-open-roster="c1"]'); await pause(page, 900);
    await page.click('[data-move-student="s1"]'); await pause(page, 300);
    await page.selectOption('.app-modal-input', 'c2'); await ok(page); await ok(page); await pause(page, 600);
    const e = await dump(page, 'enrollments/s1_c2');
    if (rules === 'v1') assert(!e && (await lastToast(page)).includes('권한'), 'v1 규칙에서 안내 없이 실패/성공: ' + JSON.stringify(e));
    else assert(e?.status === 'active' && (await dump(page, 'enrollments/s1_c1')).status === 'transferred', 'v2 규칙에서 반 이동 실패');
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
  await page.click('[data-move-student="s5"]'); await pause(page, 300);
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
  await r.page.fill('#assignment-text', '¡Hola! Me llamo Minji. Soy de Corea y soy estudiante.');
  await r.page.click('#submit-assignment'); await pause(r.page, 900);
  let d = await dump(r.page, 'classes/c1/weeks/w1/submissions/s1');
  assert(d.revision === 2, '재제출 회차: ' + d.revision);
  assert(JSON.stringify(d.firstSubmittedAt) === JSON.stringify(before.submittedAt), '처음 제출 시각이 기존 제출 시각이 아님');
  assert((await r.page.innerText('#assignment-form-area')).includes('수정본을 제출했어요'), '학생 화면에 재검토 대기 안내가 없음');
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
    await page.selectOption('#student-week-picker', 'w1'); await pause(page, 700);
    const text = await page.innerText('#student-body');
    assert(/선생님 · \d+월 \d+일 \(.\) 오전 10:00/.test(text), `${timezoneId}: 피드백 시각이 한국 시간 오전 10:00이 아님`);
    assert(/제출 권장일: \d+월 \d+일 \(.\) 오후 11:59/.test(text), `${timezoneId}: 마감 표시가 한국 시간이 아님`);
    await context.close();
  }
});

test('B12 강사 메모: Enter는 줄바꿈, Ctrl+Enter는 저장', async b => {
  const { page } = await openAs(b, 'admin.html', 'admin1');
  await page.click('[data-page="classes"]'); await pause(page, 400);
  await page.click('[data-open-roster="c1"]'); await pause(page, 900);
  await page.click('[data-student-memo="s1"]'); await pause(page, 500);
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
  await page.click('[data-edit-name="s1"]'); await pause(page, 400);
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
