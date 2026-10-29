// 배포 전환기: 지금 main(23a532c)의 화면이 쓰는 형식을 새 규칙도 받는지. 규칙을 먼저 게시해도 옛 화면(캐시된 브라우저 포함)의 저장이 그대로 되어야 합니다. 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, addDoc, updateDoc, collection, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';

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
  await put('users/s1', { role: 'student', displayName: 's1', realName: 's1', nickname: '', email: 's1@example.com', assignedClassId: 'c1' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  await put('enrollments/s1_c1', { uid: 's1', classId: 'c1', studentName: 's1', email: 's1@example.com', joinCode: 'HOLA2026', status: 'active', joinedAt: OLD });
  await put('classes/c1/members/s1', { uid: 's1', name: 's1', status: 'active', joinedAt: OLD });
  // 옛 형식의 차시: quiz.version 없음, 문항에 correctIndex
  await put(W, { label: '1주차', order: 1, published: true, assignment: { enabled: true }, quiz: { enabled: true, questions: [{ q: 'a', options: ['x', 'y'], correctIndex: 1 }, { q: 'b', options: ['x', 'y'], correctIndex: 0 }] } });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const db1 = env.authenticatedContext('s1', { email: 's1@example.com' }).firestore();
const adb = env.authenticatedContext('admin1').firestore();
const SUB = `${W}/submissions/s1`;
// 아래 쓰기는 23a532c index.html의 저장 코드와 같은 형식입니다(회차·응시 ID·버전 필드 없음)
const oldSub = text => ({ userId: 's1', studentName: 's1', email: 's1@example.com', text, audioPath: '', submittedAt: serverTimestamp() });
const oldQuiz = (score, count) => runTransaction(db1, async tx => {
  const resultRef = doc(db1, `${W}/quizResults/s1`);
  const old = (await tx.get(resultRef)).data();
  const first = old?.firstAttempt || { score, total: 2, submittedAt: new Date().toISOString(), answers: [1, 0], legacy: false };
  tx.set(doc(collection(db1, `${W}/quizResults/s1/attempts`)), { userId: 's1', answers: [1, 0], score, total: 2, attemptNumber: count, submittedAt: serverTimestamp() });
  tx.set(resultRef, { userId: 's1', studentName: 's1', email: 's1@example.com', answers: [1, 0], score, total: 2, submittedAt: serverTimestamp(), firstAttempt: first, attemptCount: count }, { merge: true });
});

await check('옛 화면: 과제 첫 제출', () => setDoc(doc(db1, SUB), oldSub('첫 답안'), { merge: true }), true);
await check('옛 화면: 과제 다시 제출', () => setDoc(doc(db1, SUB), oldSub('고친 답안'), { merge: true }), true);
await check('옛 화면: 복습 첫 응시', () => oldQuiz(1, 1), true);
await check('옛 화면: 복습 다시 풀기(첫 응시 보존)', () => oldQuiz(2, 2), true);
let qid = 'none';
await check('옛 화면: 질문 등록', async () => { const r = await addDoc(collection(db1, 'classes/c1/questions'), { uid: 's1', studentName: 's1', title: '질문', content: '내용', createdAt: serverTimestamp(), status: 'open' }); qid = r.id; return r; }, true);
await check('옛 화면: 추가 질문(답글)', () => addDoc(collection(db1, `classes/c1/questions/${qid}/replies`), { uid: 's1', role: 'student', author: 's1', text: '추가 질문', createdAt: serverTimestamp() }), true);
await check('옛 화면: 별명 바꾸기', () => setDoc(doc(db1, 'classes/c1/members/s1'), { uid: 's1', name: '별명', status: 'active' }, { merge: true }), true);
await check('옛 강사 화면: 단일 피드백 저장', () => updateDoc(doc(adb, SUB), { feedback: '좋아요', feedbackAt: serverTimestamp() }), true);
await check('옛 강사 화면: 퀴즈 문항 수정(버전 사본 없이)', () => updateDoc(doc(adb, W), { 'quiz.questions': [{ q: 'a2', options: ['x', 'y'], correctIndex: 0 }] }), true);
// 호환을 넓히다 보호가 풀리지 않았는지: 옛 형식이라도 첫 응시를 바꾸는 쓰기는 여전히 거부
await check('옛 형식이라도 첫 응시 바꾸기 거부', () => setDoc(doc(db1, `${W}/quizResults/s1`), { firstAttempt: { score: 2, total: 2, legacy: false }, attemptCount: 3, score: 2, total: 2, answers: [1, 0], userId: 's1' }, { merge: true }), false);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
