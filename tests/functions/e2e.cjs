// 강사 알림 함수(functions/) 에뮬레이터 시험: Firestore에 질문·답글·과제 제출을 쓰면 알림이 만들어지는지 끝까지 확인합니다.
// 에뮬레이터에서는 실제로 보내지 않고 _pushOutbox에 남깁니다(functions/index.js). 실행: cd tests/functions && npm test
'use strict';
const path = require('node:path');
const fromFunctions = name => require(require.resolve(name, { paths: [path.join(__dirname, '../../functions')] }));
const { initializeApp } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');

initializeApp({ projectId: 'demo-tstst' });
const db = getFirestore();
const results = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
const outbox = async () => (await db.collection('_pushOutbox').get()).docs.map(d => d.data()).sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));
// 알림이 n개가 될 때까지 기다림(첫 실행은 함수가 뜨는 시간이 걸림)
async function waitFor(n, label) {
  for (let i = 0; i < 120; i++) { const list = await outbox(); if (list.length >= n) return list[n - 1]; await pause(500); }
  throw new Error(`${label}: 알림이 오지 않음`);
}
const check = (name, ok, detail = '') => results.push(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' → ' + detail}`);
const quiet = async (n, label) => { await pause(4000); const list = await outbox(); check(label, list.length === n, `알림 ${list.length}개(기대 ${n})`); };

(async () => {
  await db.doc('classes/c1').set({ name: '스페인어 기초반 2기', archived: false });
  await db.doc('classes/c2').set({ name: '지난 반', archived: true });
  await db.doc('classes/c1/weeks/w3').set({ label: '3차시 · estar 동사와 기분' });
  await db.doc('adminDevices/d1').set({ uid: 'admin1', token: 'tok-phone', label: 'Android · Chrome' });
  await db.doc('adminDevices/d2').set({ uid: 'admin1', token: 'tok-pc', label: 'Windows · Chrome' });
  // 보관된 반에 남아 있는 답할 질문(앱 아이콘 숫자에 넣지 않음). 이 문서도 '새 질문' 알림을 하나 만들므로 기준 개수로 둡니다.
  await db.doc('classes/c2/questions/old').set({ needsTeacherReply: true, title: '보관된 반 질문' });
  await waitFor(1, '준비');

  await db.doc('classes/c1/questions/q1').set({ uid: 's2', studentName: '이준호', title: 'ser와 estar 차이가 궁금해요\n자세히는…', content: '본문', needsTeacherReply: true, weekId: 'w3', context: 'assignment' });
  let m = await waitFor(2, '새 질문');
  check('새 질문: 제목·본문·이동 위치', m.data.title === '❓ 이준호 · 새 질문 (3차시 과제)' && m.data.body === 'ser와 estar 차이가 궁금해요' && m.data.route === 'questions?class=c1&q=q1', JSON.stringify(m.data));
  check('새 질문: 등록된 기기 모두에게', JSON.stringify(m.tokens.sort()) === JSON.stringify(['tok-pc', 'tok-phone']), JSON.stringify(m.tokens));
  check('앱 아이콘 숫자: 운영 중인 반의 답할 질문만(보관된 반 제외)', m.data.badge === '1', m.data.badge);

  await db.collection('classes/c1/questions/q1/replies').add({ role: 'admin', author: '유진', text: '좋은 질문이에요' });
  await quiet(2, '강사 답글은 알리지 않음');
  await db.collection('classes/c1/questions/q1/replies').add({ role: 'student', author: '이준호', text: '그럼 estoy는요?' });
  m = await waitFor(3, '추가 질문');
  check('추가 질문: 같은 질문 tag·학생 글 첫 줄', m.data.kind === 'reply' && m.data.tag === 'q-c1-q1' && m.data.body === '그럼 estoy는요?' && m.data.title.startsWith('💬 이준호 · 추가 질문'), JSON.stringify(m.data));

  const sub = db.doc('classes/c1/weeks/w3/submissions/s1');
  await sub.set({ studentName: '김민지', text: 'Hoy estoy cansada.', revision: 1 });
  m = await waitFor(4, '과제 제출');
  check('과제 제출: 묶음 tag·이름·차시·과제 화면 위치', m.data.kind === 'submission' && m.data.tag === 'submissions' && m.data.name === '김민지' && m.data.session === '3차시' && m.data.revised === '0' && m.data.route === 'feedback?class=c1&week=w3&uid=s1', JSON.stringify(m.data));
  await sub.update({ feedbacks: [{ text: '좋아요', forRevision: 1 }] });
  await sub.update({ studentSeenFeedbackAt: Timestamp.now() });
  await quiet(4, '피드백 저장·확인 시각은 알리지 않음');
  await sub.update({ revision: 2, text: 'Hoy estoy contenta.' });
  m = await waitFor(5, '수정본 제출');
  check('수정본 제출', m.data.revised === '1' && m.data.title === '📝 김민지 · 3차시 수정본 제출', JSON.stringify(m.data));

  await db.doc('adminDevices/d1').update({ lastSeenAt: Timestamp.now() });
  await quiet(5, '기기 정보만 바뀌면 시험 알림을 보내지 않음');
  await db.doc('adminDevices/d1').update({ testRequestedAt: Timestamp.now() });
  m = await waitFor(6, '시험 알림');
  check('시험 알림: 누른 기기에만', m.data.kind === 'test' && JSON.stringify(m.tokens) === '["tok-phone"]', JSON.stringify(m));

  console.log(results.join('\n'));
  process.exit(results.some(r => r.startsWith('✗')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('✗', e.message); process.exit(1); });
