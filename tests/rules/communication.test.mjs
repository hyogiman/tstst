// 배치 05 규칙: 질문 상태(P0-03)와 과제 제출 회차(P0-04). 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, addDoc, deleteDoc, collection, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
await env.clearFirestore();
const OLD = Timestamp.fromMillis(Date.UTC(2026, 9, 1, 12));
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put('users/admin1', { role: 'admin', displayName: '유진' });
  for (const uid of ['s1', 's2']) await put('users/' + uid, { role: 'student', displayName: uid, email: uid + '@example.com' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  for (const uid of ['s1', 's2']) await put(`enrollments/${uid}_c1`, { uid, classId: 'c1', status: 'active' });
  await put('classes/c1/questions/q1', { uid: 's1', studentName: 's1', title: '질문', content: '내용', status: 'answered', createdAt: OLD, needsTeacherReply: false, lastSenderRole: 'admin', lastMessageAt: OLD });
  await put('classes/c1/questions/q2', { uid: 's2', studentName: 's2', title: '질문', content: '내용', status: 'answered', createdAt: OLD });
  await put('classes/c1/weeks/w1', { label: '1차시', order: 1, published: true, assignment: { enabled: true }, quiz: { enabled: true } });
  // 이전 형식(회차 정보 없음) 제출과 v2 형식 제출
  await put('classes/c1/weeks/w1/submissions/s1', { userId: 's1', studentName: 's1', email: 's1@example.com', text: '첫 답안', audioPath: '', submittedAt: OLD, feedbacks: [{ id: 'f1', text: '좋아요', createdAt: '2026-10-02T03:00:00.000Z' }] });
  await put('classes/c1/weeks/w1/submissions/s2', { userId: 's2', studentName: 's2', email: 's2@example.com', text: '답안', audioPath: '', submittedAt: OLD, revision: 2, firstSubmittedAt: OLD, latestSubmittedAt: OLD });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const db1 = env.authenticatedContext('s1').firestore();
const question = extra => ({ uid: 's1', studentName: 's1', title: '새 질문', content: '내용', createdAt: serverTimestamp(), status: 'open', ...extra });
const followUp = { status: 'open', needsTeacherReply: true, lastMessageAt: serverTimestamp(), lastSenderRole: 'student', updatedAt: serverTimestamp() };

// --- P0-03 질문 ---
await check('새 질문(상태 필드 포함)', () => addDoc(collection(db1, 'classes/c1/questions'), question({ needsTeacherReply: true, lastMessageAt: serverTimestamp(), lastSenderRole: 'student' })), true);
await check('새 질문: needsTeacherReply=false 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ needsTeacherReply: false })), false);
await check('새 질문: lastSenderRole=admin 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ lastSenderRole: 'admin' })), false);
await check('답변 완료된 내 질문에 추가 질문 → 답변 대기로', () => {
  const b = writeBatch(db1);
  b.set(doc(collection(db1, 'classes/c1/questions/q1/replies')), { uid: 's1', role: 'student', author: 's1', text: '하나 더 궁금해요', createdAt: serverTimestamp() });
  b.update(doc(db1, 'classes/c1/questions/q1'), followUp);
  return b.commit();
}, true);
await check('학생이 내 질문을 답변 완료로 바꾸기 거부', () => updateDoc(doc(db1, 'classes/c1/questions/q1'), { status: 'answered', needsTeacherReply: false }), false);
await check('학생이 질문 제목 바꾸기 거부', () => updateDoc(doc(db1, 'classes/c1/questions/q1'), { ...followUp, title: '바꾼 제목' }), false);
await check('학생이 lastMessageAt을 임의 시각으로 쓰기 거부', () => updateDoc(doc(db1, 'classes/c1/questions/q1'), { ...followUp, lastMessageAt: OLD }), false);
await check('다른 학생 질문 상태 바꾸기 거부', () => updateDoc(doc(db1, 'classes/c1/questions/q2'), followUp), false);

// --- P0-04 제출 회차 ---
const sub = extra => ({ userId: 's1', studentName: 's1', email: 's1@example.com', text: '고친 답안', audioPath: '', submittedAt: serverTimestamp(), latestSubmittedAt: serverTimestamp(), ...extra });
await check('이전 형식 제출에 재제출 → 2차, 처음 제출 시각 = 기존 제출 시각', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 2, firstSubmittedAt: OLD }), { merge: true }), true);
await check('회차 건너뛰기(2→4) 거부', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 4 }), { merge: true }), false);
await check('3차 제출(처음 제출 시각 그대로)', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 3, firstSubmittedAt: OLD }), { merge: true }), true);
await check('처음 제출 시각 바꾸기 거부', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 4, firstSubmittedAt: serverTimestamp() }), { merge: true }), false);
await check('학생이 피드백 필드 바꾸기 거부', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), { ...sub({ revision: 4 }), feedbacks: [] }, { merge: true }), false);
await check('다른 학생 제출 쓰기 거부', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s2'), sub({ revision: 3 }), { merge: true }), false);
await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'classes/c1/weeks/w1/submissions/s1')));
await check('첫 제출은 1차 + 처음 제출 시각 = 지금', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 1, firstSubmittedAt: serverTimestamp() })), true);
await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'classes/c1/weeks/w1/submissions/s1')));
await check('첫 제출을 2차로 만들기 거부', () => setDoc(doc(db1, 'classes/c1/weeks/w1/submissions/s1'), sub({ revision: 2, firstSubmittedAt: serverTimestamp() })), false);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
