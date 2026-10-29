// 보관된 반(2026-10-29 요청): 수강했던 학생은 지난 자료를 읽을 수 있고, 강의 영상과 새 쓰기는 막힙니다.
// 저장소의 firestore.rules · storage.rules를 에뮬레이터에서 검증합니다. 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});
await env.clearFirestore();
await env.clearStorage();
const AUDIO = new Uint8Array([1, 2, 3]);
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore(), st = ctx.storage();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put('users/admin1', { role: 'admin', displayName: '유진', email: 'teacher@example.com' });
  for (const uid of ['s1', 's4', 's5']) await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  await put('classes/c3', { name: '왕초보반', joinCode: 'OLA2025', archived: true });
  const en = (uid, cid, status) => put(`enrollments/${uid}_${cid}`, { uid, classId: cid, studentName: uid, email: uid + '@example.com', joinCode: 'X', status, joinedAt: new Date() });
  await en('s1', 'c1', 'active'); await en('s4', 'c1', 'inactive'); await en('s5', 'c3', 'active');
  const week = { label: '1차시', order: 1, published: true, assignment: { enabled: true }, quiz: { enabled: true, questions: [] }, preview: { enabled: true } };
  await put('classes/c1/weeks/w1', week);
  await put('classes/c3/weeks/ow1', week);
  await put('classes/c3/weeks/ow2', { ...week, published: false });
  await put('classes/c3/members/s5', { uid: 's5', name: '정하은', status: 'active' });
  await put('classes/c3/weeks/ow1/submissions/s5', { userId: 's5', text: 'A, B, C', audioPath: '', submittedAt: new Date() });
  await put('classes/c3/weeks/ow1/quizResults/s5', { userId: 's5', score: 1, total: 2, answers: [], attemptCount: 1, firstAttempt: { score: 1, total: 2 } });
  await put('classes/c3/weeks/ow1/quizResults/s5/attempts/a1', { userId: 's5', score: 1, total: 2, answers: [], attemptNumber: 1 });
  await put('classes/c3/weeks/ow1/attendance/s5', { status: 'present' });
  await put('classes/c3/questions/oq1', { uid: 's5', studentName: '정하은', title: '질문', content: '내용', status: 'answered', createdAt: new Date() });
  await put('classes/c3/questions/oq1/replies/r1', { uid: 'admin1', role: 'admin', author: '유진', text: '답변', createdAt: new Date() });
  for (const path of ['classes/c3/previews/ow1/video/lesson.mp4', 'classes/c1/previews/w1/video/lesson.mp4'])
    await uploadBytes(ref(st, path), new Uint8Array([0, 0, 0, 1]), { contentType: 'video/mp4' });
  await uploadBytes(ref(st, 'classes/c3/previews/ow1/file/abc.pdf'), new Uint8Array([37, 80]), { contentType: 'application/pdf' });
  await uploadBytes(ref(st, 'classes/c3/submissions/ow1/s5/a.webm'), AUDIO, { contentType: 'audio/webm' });
  await uploadBytes(ref(st, 'classes/c3/feedback/ow1/s5/f.webm'), AUDIO, { contentType: 'audio/webm' });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const as = uid => env.authenticatedContext(uid, { email: uid === 'admin1' ? 'teacher@example.com' : uid + '@example.com' });
const s5 = as('s5'), s1 = as('s1'), s4 = as('s4'), admin = as('admin1');
const f5 = s5.firestore(), f1 = s1.firestore();

// --- Firestore: 보관된 반의 지난 자료 읽기 ---
await check('보관된 반 학생 s5: 반 문서 읽기', () => getDoc(doc(f5, 'classes/c3')), true);
await check('s5: 공개 차시 목록', () => getDocs(query(collection(f5, 'classes/c3/weeks'), where('published', '==', true))), true);
await check('s5: 비공개 차시 읽기 거부', () => getDoc(doc(f5, 'classes/c3/weeks/ow2')), false);
await check('s5: 내 과제 제출 읽기', () => getDoc(doc(f5, 'classes/c3/weeks/ow1/submissions/s5')), true);
await check('s5: 내 복습 결과·응시 기록 읽기', () => getDocs(collection(f5, 'classes/c3/weeks/ow1/quizResults/s5/attempts')), true);
await check('s5: 내 출석 읽기', () => getDoc(doc(f5, 'classes/c3/weeks/ow1/attendance/s5')), true);
await check('s5: 내 질문 목록', () => getDocs(query(collection(f5, 'classes/c3/questions'), where('uid', '==', 's5'))), true);
await check('s5: 내 질문의 답변 읽기', () => getDocs(collection(f5, 'classes/c3/questions/oq1/replies')), true);
await check('s5: 반 명단 읽기', () => getDocs(collection(f5, 'classes/c3/members')), true);
// --- Firestore: 보관된 반에는 새로 쓰지 못함 ---
await check('s5: 보관된 반에 과제 제출 거부', () => setDoc(doc(f5, 'classes/c3/weeks/ow1/submissions/s5'), { userId: 's5', studentName: 's5', email: 's5@example.com', text: 'x', audioPath: '', submittedAt: serverTimestamp() }), false);
await check('s5: 보관된 반에 새 질문 거부', () => addDoc(collection(f5, 'classes/c3/questions'), { uid: 's5', studentName: 's5', title: 't', content: 'c', createdAt: serverTimestamp(), status: 'open' }), false);
await check('s5: 보관된 반 질문에 답장 거부', () => addDoc(collection(f5, 'classes/c3/questions/oq1/replies'), { uid: 's5', role: 'student', author: 's5', text: '감사합니다', createdAt: serverTimestamp() }), false);
// --- Firestore: 다른 경우는 그대로 ---
await check('수강 중지 s4: 반 문서 읽기 거부', () => getDoc(doc(s4.firestore(), 'classes/c1')), false);
await check('운영 중인 반 s1: 과제 제출', () => setDoc(doc(f1, 'classes/c1/weeks/w1/submissions/s1'), { userId: 's1', studentName: 's1', email: 's1@example.com', text: 'hola', audioPath: '', submittedAt: serverTimestamp() }), true);
await check('운영 중인 반 s1: 새 질문', () => addDoc(collection(f1, 'classes/c1/questions'), { uid: 's1', studentName: 's1', title: 't', content: 'c', createdAt: serverTimestamp(), status: 'open' }), true);

// --- Storage: 강의 영상만 막힘 ---
await check('s5: 보관된 반 강의 영상 읽기 거부', () => getBytes(ref(s5.storage(), 'classes/c3/previews/ow1/video/lesson.mp4')), false);
await check('s5: 보관된 반 첨부 자료 읽기', () => getBytes(ref(s5.storage(), 'classes/c3/previews/ow1/file/abc.pdf')), true);
await check('s5: 내 과제 음성 읽기', () => getBytes(ref(s5.storage(), 'classes/c3/submissions/ow1/s5/a.webm')), true);
await check('s5: 선생님 피드백 음성 읽기', () => getBytes(ref(s5.storage(), 'classes/c3/feedback/ow1/s5/f.webm')), true);
await check('s5: 보관된 반에 과제 음성 업로드 거부', () => uploadBytes(ref(s5.storage(), 'classes/c3/submissions/ow1/s5/new.webm'), AUDIO, { contentType: 'audio/webm' }), false);
await check('운영 중인 반 s1: 강의 영상 읽기', () => getBytes(ref(s1.storage(), 'classes/c1/previews/w1/video/lesson.mp4')), true);
await check('운영 중인 반 s1: 과제 음성 업로드', () => uploadBytes(ref(s1.storage(), 'classes/c1/submissions/w1/s1/new.webm'), AUDIO, { contentType: 'audio/webm' }), true);
await check('수강 중지 s4: 강의 영상 읽기 거부', () => getBytes(ref(s4.storage(), 'classes/c1/previews/w1/video/lesson.mp4')), false);
await check('강사: 운영 중인 반 영상 읽기', () => getBytes(ref(admin.storage(), 'classes/c1/previews/w1/video/lesson.mp4')), true);
await check('강사: 보관된 반 영상 읽기', () => getBytes(ref(admin.storage(), 'classes/c3/previews/ow1/video/lesson.mp4')), true);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
