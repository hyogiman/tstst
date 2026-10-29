// 배치 10·11 규칙: 질문의 차시 연결(weekId·context), '틀린 문제만 다시 풀기' 응시 기록(mode:'wrongOnly'), 다음 학습 목표(studentGoals). 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, collection, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

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
  for (const uid of ['s1', 's2']) await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  for (const uid of ['s1', 's2']) await put(`enrollments/${uid}_c1`, { uid, classId: 'c1', studentName: uid, email: uid + '@example.com', joinCode: 'HOLA2026', status: 'active', joinedAt: OLD });
  await put(W, { label: '1차시', order: 1, published: true, assignment: { enabled: true }, quiz: { enabled: true, version: 1, questions: [] } });
  // s1은 3문항 퀴즈를 한 번 풀었음(1/3). s2는 아직 응시 기록 없음
  await put(`${W}/quizResults/s1`, { userId: 's1', studentName: 's1', email: 's1@example.com', answers: ['1', '0', '0'], answersById: { q1: [1], q2: [0], q3: [0] }, questionIds: ['q1', 'q2', 'q3'], quizVersion: 1, score: 1, total: 3, submittedAt: OLD, firstAttempt: { score: 1, total: 3, legacy: false }, attemptCount: 1 });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const db1 = env.authenticatedContext('s1').firestore();
const db2 = env.authenticatedContext('s2').firestore();
const question = extra => ({ uid: 's1', studentName: 's1', title: '[1차시 과제] 질문', content: '내용', createdAt: serverTimestamp(), status: 'open', needsTeacherReply: true, lastMessageAt: serverTimestamp(), lastSenderRole: 'student', ...extra });
const attempt = extra => ({ userId: 's1', answers: ['2'], answersById: { q1: [2] }, questionIds: ['q1'], quizVersion: 1, score: 1, total: 1, attemptNumber: 1, submittedAt: serverTimestamp(), mode: 'wrongOnly', ...extra });

// --- 질문의 차시 연결 ---
await check('피드백에 질문하기: weekId + context(assignment)', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w1', context: 'assignment' })), true);
await check('복습 피드백에 질문하기: context(quiz)', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w1', context: 'quiz' })), true);
await check('질문 작성 폼에서 차시만 고름(context 없음)', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w1' })), true);
await check('알 수 없는 context 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w1', context: 'grade' })), false);
await check('weekId가 문자열이 아니면 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 3 })), false);
await check('weekId가 너무 길면 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w'.repeat(101) })), false);
await check('허용하지 않은 필드 거부', () => addDoc(collection(db1, 'classes/c1/questions'), question({ weekId: 'w1', priority: 'high' })), false);

// --- 틀린 문제만 다시 풀기 ---
const A = `${W}/quizResults/s1/attempts`;
await check('틀린 문제만: 요약 문서는 그대로 두고 응시 기록만 저장', () => setDoc(doc(db1, `${A}/p1`), attempt()), true);
await check('틀린 문제만: 2문항 중 1문항 정답', () => setDoc(doc(db1, `${A}/p2`), attempt({ answers: ['2', '1'], answersById: { q1: [2], q2: [1] }, questionIds: ['q1', 'q2'], score: 1, total: 2 })), true);
await check('틀린 문제만: 문항 수가 전체보다 많으면 거부', () => setDoc(doc(db1, `${A}/p3`), attempt({ score: 4, total: 4 })), false);
await check('틀린 문제만: 점수가 문항 수보다 크면 거부', () => setDoc(doc(db1, `${A}/p4`), attempt({ score: 2, total: 1 })), false);
await check('틀린 문제만: 첫 응시 기록이 없으면 거부', () => setDoc(doc(db2, `${W}/quizResults/s2/attempts/p5`), attempt({ userId: 's2' })), false);
await check('알 수 없는 mode 거부', () => setDoc(doc(db1, `${A}/p6`), attempt({ mode: 'bonus' })), false);
const { mode: _omit, ...fullAttempt } = attempt({ score: 0, total: 3 }); // mode가 없는 기존 형식 = 전체 응시
await check('전체 응시(mode 없음)는 요약 점수와 다르면 거부', () => setDoc(doc(db1, `${A}/p7`), fullAttempt), false);
await check('전체 응시: 요약 문서와 같은 일괄 쓰기면 저장', () => {
  const b = writeBatch(db1);
  b.set(doc(db1, `${A}/p8`), attempt({ mode: 'full', answers: ['2', '0', '0'], answersById: { q1: [2], q2: [0], q3: [0] }, questionIds: ['q1', 'q2', 'q3'], score: 2, total: 3, attemptNumber: 2 }));
  b.set(doc(db1, `${W}/quizResults/s1`), { answers: ['2', '0', '0'], answersById: { q1: [2], q2: [0], q3: [0] }, questionIds: ['q1', 'q2', 'q3'], quizVersion: 1, score: 2, total: 3, submittedAt: serverTimestamp(), attemptCount: 2, firstAttempt: { score: 1, total: 3, legacy: false } }, { merge: true });
  return b.commit();
}, true);

// --- 다음 학습 목표(배치 11): 강사가 쓰고 그 학생만 읽음. 강사 메모와 저장 위치가 다름 ---
const adb = env.authenticatedContext('admin1').firestore();
const G = 'classes/c1/studentGoals';
await check('강사: 학생 목표 저장', () => setDoc(doc(adb, `${G}/s1`), { text: '연결 표현(pero, porque) 2개 써 보기', updatedAt: serverTimestamp(), updatedBy: 'admin1' }), true);
await check('강사: 200자 넘는 목표 거부', () => setDoc(doc(adb, `${G}/s2`), { text: 'a'.repeat(201), updatedAt: serverTimestamp(), updatedBy: 'admin1' }), false);
await check('강사: 허용하지 않은 필드 거부', () => setDoc(doc(adb, `${G}/s2`), { text: '목표', note: '메모를 섞음', updatedAt: serverTimestamp(), updatedBy: 'admin1' }), false);
await check('학생: 내 목표 읽기', () => getDoc(doc(db1, `${G}/s1`)), true);
await check('다른 학생: 목표 읽기 거부', () => getDoc(doc(db2, `${G}/s1`)), false);
await check('학생: 목표 목록 조회 거부', () => getDocs(collection(db1, G)), false);
await check('학생: 내 목표 쓰기 거부', () => setDoc(doc(db1, `${G}/s1`), { text: '스스로 바꿈', updatedAt: serverTimestamp(), updatedBy: 's1' }), false);
await check('학생: 강사 메모 읽기 거부(목표와 분리)', () => getDoc(doc(db1, 'classes/c1/teacherNotes/s1')), false);
await check('강사: 목표 지우기', () => deleteDoc(doc(adb, `${G}/s1`)), true);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
