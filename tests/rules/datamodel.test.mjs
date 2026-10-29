// 배치 06 규칙: 제출 이력(P1-01), 퀴즈 버전(P1-02), 수강 기간 기록(P1-04), 확인 시각(P1-05). 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
await env.clearFirestore();
const OLD = Timestamp.fromMillis(Date.UTC(2026, 9, 1, 12));
const W = 'classes/c1/weeks/w1';
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put('users/admin1', { role: 'admin', displayName: '유진' });
  for (const uid of ['s1', 's2', 's6']) await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  for (const uid of ['s1', 's2']) await put(`enrollments/${uid}_c1`, { uid, classId: 'c1', studentName: uid, email: uid + '@example.com', joinCode: 'HOLA2026', status: 'active', joinedAt: OLD });
  await put(W, { label: '1차시', order: 1, published: true, assignment: { enabled: true }, quiz: { enabled: true, version: 1, questions: [] } });
  // 회차 정보가 없는 이전 형식 제출(s1)과 회차가 있는 제출(s2)
  await put(`${W}/submissions/s1`, { userId: 's1', studentName: 's1', email: 's1@example.com', text: '첫 답안', audioPath: '', submittedAt: OLD, feedbacks: [{ id: 'f1', text: '좋아요', createdAt: '2026-10-02T03:00:00.000Z' }] });
  await put(`${W}/submissions/s2`, { userId: 's2', studentName: 's2', email: 's2@example.com', text: '2차 답안', audioPath: '', submittedAt: OLD, revision: 2, firstSubmittedAt: OLD, latestSubmittedAt: OLD });
  await put(`${W}/submissions/s2/revisions/2`, { revision: 2, text: '2차 답안', audioPath: '', submittedAt: OLD, studentName: 's2' });
  await put(`${W}/quizResults/s1`, { userId: 's1', studentName: 's1', email: 's1@example.com', answers: ['0'], score: 1, total: 1, submittedAt: OLD, firstAttempt: { score: 1, total: 1 }, attemptCount: 1, feedbacks: [{ id: 'f2', text: '잘했어요' }] });
  await put(`${W}/quizVersions/1`, { version: 1, questions: [{ id: 'q1', stem: '문제', options: ['a', 'b'], correctIndices: [0] }] });
  await put('classes/c1/questions/q1', { uid: 's1', studentName: 's1', title: '질문', content: '내용', status: 'answered', createdAt: OLD });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const db1 = env.authenticatedContext('s1', { email: 's1@example.com' }).firestore();
const db6 = env.authenticatedContext('s6', { email: 's6@example.com' }).firestore();
const adb = env.authenticatedContext('admin1').firestore();
const summary = (extra = {}) => ({ userId: 's1', studentName: 's1', email: 's1@example.com', text: '고친 답안', audioPath: '', audioDuration: null, submittedAt: serverTimestamp(), latestSubmittedAt: serverTimestamp(), ...extra });

// --- P1-01 제출 이력 ---
await check('이전 형식 제출에 재제출: 1차 보존 + 2차 기록 + 요약 갱신(한 번에)', () => {
  const b = writeBatch(db1);
  b.set(doc(db1, `${W}/submissions/s1/revisions/1`), { revision: 1, text: '첫 답안', audioPath: '', audioDuration: null, submittedAt: OLD, studentName: 's1', legacy: true });
  b.set(doc(db1, `${W}/submissions/s1/revisions/2`), { revision: 2, text: '고친 답안', audioPath: '', audioDuration: null, submittedAt: serverTimestamp(), studentName: 's1' });
  b.set(doc(db1, `${W}/submissions/s1`), summary({ revision: 2, firstSubmittedAt: OLD }), { merge: true });
  return b.commit();
}, true);
await check('제출 이력 수정 거부', () => updateDoc(doc(db1, `${W}/submissions/s1/revisions/2`), { text: '몰래 고침' }), false);
await check('제출 이력 삭제 거부', () => deleteDoc(doc(db1, `${W}/submissions/s1/revisions/1`)), false);
await check('요약과 다른 회차 번호의 이력 거부', () => {
  const b = writeBatch(db1);
  b.set(doc(db1, `${W}/submissions/s1/revisions/5`), { revision: 5, text: 'x', audioPath: '', submittedAt: serverTimestamp(), studentName: 's1' });
  b.set(doc(db1, `${W}/submissions/s1`), summary({ revision: 3 }), { merge: true });
  return b.commit();
}, false);
await check('3차 제출: 이력 + 요약', () => {
  const b = writeBatch(db1);
  b.set(doc(db1, `${W}/submissions/s1/revisions/3`), { revision: 3, text: '세 번째', audioPath: '', audioDuration: 12, submittedAt: serverTimestamp(), studentName: 's1' });
  b.set(doc(db1, `${W}/submissions/s1`), summary({ text: '세 번째', audioDuration: 12, revision: 3 }), { merge: true });
  return b.commit();
}, true);
await check('이미 회차가 있는 제출에 가짜 1차(이전 기록) 만들기 거부', () => setDoc(doc(db1, `${W}/submissions/s2/revisions/1`), { revision: 1, text: '가짜', audioPath: '', submittedAt: OLD, studentName: 's2', legacy: true }), false);
await check('다른 학생 이력 읽기 거부', () => getDocs(collection(db1, `${W}/submissions/s2/revisions`)), false);
await check('내 이력 읽기', () => getDocs(collection(db1, `${W}/submissions/s1/revisions`)), true);
await check('강사: 이력 삭제(영구 삭제 흐름)', () => deleteDoc(doc(adb, `${W}/submissions/s2/revisions/2`)), true);

// --- P1-02 퀴즈 버전 사본 · 문항 ID별 답 ---
await check('학생: 퀴즈 버전 사본 읽기 거부', () => getDoc(doc(db1, `${W}/quizVersions/1`)), false);
await check('강사: 퀴즈 버전 사본 쓰기', () => setDoc(doc(adb, `${W}/quizVersions/2`), { version: 2, questions: [] }), true);
await check('학생: 문항 ID별 답·버전과 함께 복습 결과 저장', () => {
  const b = writeBatch(db1);
  b.set(doc(db1, `${W}/quizResults/s1/attempts/a2`), { userId: 's1', answers: ['0,1'], answersById: { q1: [0, 1] }, questionIds: ['q1'], quizVersion: 1, score: 0, total: 1, attemptNumber: 2, submittedAt: serverTimestamp() });
  b.set(doc(db1, `${W}/quizResults/s1`), { answers: ['0,1'], answersById: { q1: [0, 1] }, questionIds: ['q1'], quizVersion: 1, score: 0, total: 1, submittedAt: serverTimestamp(), attemptCount: 2, firstAttempt: { score: 1, total: 1 } }, { merge: true });
  return b.commit();
}, true);

// --- P1-04 수강 기간 기록 ---
await check('학생 입장: 수강 등록 + joined 기록(한 번에)', () => {
  const b = writeBatch(db6);
  b.set(doc(db6, 'enrollments/s6_c1'), { uid: 's6', classId: 'c1', studentName: 's6', email: 's6@example.com', joinCode: 'HOLA2026', status: 'active', joinedAt: serverTimestamp() });
  b.set(doc(db6, 'enrollments/s6_c1/events/e1'), { type: 'joined', at: serverTimestamp(), by: 's6', toClassId: 'c1' });
  return b.commit();
}, true);
await check('학생: 등록 뒤 따로 기록 추가 거부', () => setDoc(doc(db6, 'enrollments/s6_c1/events/e2'), { type: 'joined', at: serverTimestamp(), by: 's6', toClassId: 'c1' }), false);
await check('학생: stopped 기록 거부', () => setDoc(doc(db1, 'enrollments/s1_c1/events/e3'), { type: 'stopped', at: serverTimestamp(), by: 's1' }), false);
await check('학생: 기록 읽기 거부', () => getDocs(collection(db6, 'enrollments/s6_c1/events')), false);
await check('강사: 수강 중지 + stopped 기록', () => {
  const b = writeBatch(adb);
  b.update(doc(adb, 'enrollments/s2_c1'), { status: 'inactive' });
  b.set(doc(adb, 'enrollments/s2_c1/events/e4'), { type: 'stopped', at: serverTimestamp(), by: 'admin1' });
  return b.commit();
}, true);
await check('강사도 기록 수정 거부(변경 불가)', () => updateDoc(doc(adb, 'enrollments/s2_c1/events/e4'), { type: 'joined' }), false);

// --- P1-05 확인 시각 ---
await check('학생: 과제 피드백 확인 시각', () => updateDoc(doc(db1, `${W}/submissions/s1`), { studentSeenFeedbackAt: serverTimestamp() }), true);
await check('학생: 확인 시각을 임의 시각으로 거부', () => updateDoc(doc(db1, `${W}/submissions/s1`), { studentSeenFeedbackAt: OLD }), false);
await check('학생: 확인 시각과 함께 피드백 고치기 거부', () => updateDoc(doc(db1, `${W}/submissions/s1`), { studentSeenFeedbackAt: serverTimestamp(), feedbacks: [] }), false);
await check('학생: 복습 피드백 확인 시각', () => updateDoc(doc(db1, `${W}/quizResults/s1`), { studentSeenFeedbackAt: serverTimestamp() }), true);
await check('학생: 질문 대화 확인 시각', () => updateDoc(doc(db1, 'classes/c1/questions/q1'), { studentSeenAt: serverTimestamp() }), true);
await check('학생: 확인 시각에 끼워 질문 제목 바꾸기 거부', () => updateDoc(doc(db1, 'classes/c1/questions/q1'), { studentSeenAt: serverTimestamp(), title: '바뀐 제목' }), false);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
