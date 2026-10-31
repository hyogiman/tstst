// 반 영구 삭제(2026-10-31): 강사 화면 deleteClassDeep과 같은 순서로 실제 규칙(에뮬레이터)에서 반의 기록을 모두 지울 수 있는지 확인합니다.
// 답변을 기다리는 질문·학생 추가 질문·제출 이력·응시 기록·공지 확인·학습 목표·메모·수강 기록까지 넣고 지웁니다.
// 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
await env.clearFirestore();
const T = Timestamp.fromMillis(Date.UTC(2026, 9, 20, 12));
const CID = 'cd1', CODE = 'DEL2026';
const seed = async () => env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore(), put = (p, d) => setDoc(doc(db, p), d);
  await put('users/admin1', { role: 'admin', displayName: '유진' });
  for (const uid of ['s1', 's2']) await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com', assignedClassId: CID });
  await put('classes/' + CID, { name: '삭제할 반', joinCode: CODE, archived: false, schedule: [] });
  await put('joinCodes/' + CODE, { classId: CID, createdBy: 'admin1', updatedAt: T });
  for (const uid of ['s1', 's2']) {
    await put(`enrollments/${uid}_${CID}`, { uid, classId: CID, studentName: uid, email: uid + '@example.com', joinCode: CODE, status: 'active', joinedAt: T });
    await put(`enrollments/${uid}_${CID}/events/e1`, { type: 'joined', at: T, by: uid, toClassId: CID });
    await put(`classes/${CID}/members/${uid}`, { uid, name: uid, status: 'active', joinedAt: T });
  }
  // 답변을 기다리는 질문(학생 추가 질문 포함)과 답변한 질문
  await put(`classes/${CID}/questions/q1`, { uid: 's1', studentName: 's1', title: '아직 답 없음', content: '내용', status: 'open', needsTeacherReply: true, createdAt: T, lastMessageAt: T, lastSenderRole: 'student' });
  await put(`classes/${CID}/questions/q1/replies/r1`, { uid: 's1', role: 'student', author: 's1', text: '추가 질문', createdAt: T });
  await put(`classes/${CID}/questions/q2`, { uid: 's2', studentName: 's2', title: '답함', content: '내용', status: 'answered', needsTeacherReply: false, createdAt: T, lastMessageAt: T, lastSenderRole: 'admin' });
  await put(`classes/${CID}/questions/q2/replies/r1`, { uid: 'admin1', role: 'admin', author: '유진', text: '답변', createdAt: T });
  await put(`classes/${CID}/notices/n1`, { title: '공지', body: '', pinned: false, createdAt: T, updatedAt: T, createdBy: 'admin1', authorName: '유진' });
  await put(`classes/${CID}/noticeReads/s1`, { uid: 's1', lastSeenAt: T });
  await put(`classes/${CID}/studentGoals/s1`, { text: '목표', updatedAt: T });
  await put(`classes/${CID}/teacherNotes/s1`, { text: '메모', updatedAt: T });
  await put(`classes/${CID}/weeks/w1`, { label: '1차시', order: 1, published: true, preview: { enabled: true }, assignment: { enabled: true }, quiz: { enabled: true } });
  await put(`classes/${CID}/weeks/w1/submissions/s1`, { userId: 's1', studentName: 's1', text: '답안', audioPath: '', submittedAt: T, revision: 2, feedbacks: [{ id: 'f1', text: '좋아요', audioPath: '', createdAt: '2026-10-20T12:00:00Z', author: '유진' }] });
  await put(`classes/${CID}/weeks/w1/submissions/s1/revisions/1`, { revision: 1, text: '첫 답안', audioPath: '', submittedAt: T });
  await put(`classes/${CID}/weeks/w1/quizResults/s1`, { userId: 's1', score: 2, total: 3, submittedAt: T });
  await put(`classes/${CID}/weeks/w1/quizResults/s1/attempts/a1`, { score: 2, total: 3, at: T, mode: 'full' });
  await put(`classes/${CID}/weeks/w1/attendance/s1`, { status: 'present', updatedAt: T });
  await put(`classes/${CID}/weeks/w1/quizVersions/1`, { questions: [], createdAt: T });
});

// 강사 화면(admin.html)의 삭제 순서를 그대로 옮긴 것. 단계 이름을 남겨 어디서 막히는지 봅니다.
async function purgeDocs(db, ref) {
  const snap = await getDocs(ref);
  for (let i = 0; i < snap.docs.length; i += 350) { const batch = writeBatch(db); snap.docs.slice(i, i + 350).forEach(x => batch.delete(x.ref)); await batch.commit(); }
  return snap.docs;
}
async function purgeWeekRecords(db, cid, wid) {
  const base = ['classes', cid, 'weeks', wid];
  for (const kind of ['submissions', 'quizResults']) {
    const docs = await getDocs(collection(db, ...base, kind));
    for (const d of docs.docs) {
      if (kind === 'submissions') await purgeDocs(db, collection(db, ...base, kind, d.id, 'revisions'));
      if (kind === 'quizResults') await purgeDocs(db, collection(db, ...base, kind, d.id, 'attempts'));
    }
    await purgeDocs(db, collection(db, ...base, kind));
  }
  await purgeDocs(db, collection(db, ...base, 'attendance'));
  await purgeDocs(db, collection(db, ...base, 'quizVersions'));
}
async function deleteClassLikeApp(db, cid, joinCode, log) {
  const step = async (name, fn) => { log.push(name); await fn(); };
  await step('반을 삭제 중으로 표시', () => updateDoc(doc(db, 'classes', cid), { archived: true, deleting: true, updatedAt: serverTimestamp() }));
  const enrollments = (await getDocs(query(collection(db, 'enrollments'), where('classId', '==', cid)))).docs;
  for (const e of enrollments) {
    await step('수강 기록 이력', () => purgeDocs(db, collection(db, 'enrollments', e.id, 'events')));
    await step('학생 소속반 표시', async () => { const ref = doc(db, 'users', e.data().uid), snap = await getDoc(ref); if (snap.exists() && snap.data().assignedClassId === cid) await updateDoc(ref, { assignedClassId: deleteField() }); });
    await step('수강 기록', () => deleteDoc(e.ref));
  }
  await step('수강 코드', () => deleteDoc(doc(db, 'joinCodes', joinCode)));
  const weeks = (await getDocs(collection(db, 'classes', cid, 'weeks'))).docs;
  for (const w of weeks) await step('차시 기록', async () => { await purgeWeekRecords(db, cid, w.id); await deleteDoc(w.ref); });
  await step('질문', async () => { const qs = await getDocs(collection(db, 'classes', cid, 'questions')); for (const q of qs.docs) { await purgeDocs(db, collection(db, 'classes', cid, 'questions', q.id, 'replies')); await deleteDoc(q.ref); } });
  for (const sub of ['members', 'teacherNotes', 'studentGoals', 'notices', 'noticeReads']) await step(sub, () => purgeDocs(db, collection(db, 'classes', cid, sub)));
  await step('반 문서', () => deleteDoc(doc(db, 'classes', cid)));
}

const results = [];
await seed();
// 한 번 시작했다가 멈춘 삭제처럼 반이 이미 보관·삭제 중인 상태에서 다시 지웁니다(강사 화면의 '삭제 마저 하기').
await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'classes/' + CID), { archived: true, deleting: true }));
const log = [];
try {
  await deleteClassLikeApp(env.authenticatedContext('admin1').firestore(), CID, CODE, log);
  results.push('✓ 강사: 답변 대기 질문·추가 질문·제출 이력·응시 기록·공지·학습 목표·메모·수강 기록이 있는 반을 끝까지 삭제');
} catch (e) { results.push(`✗ 강사 반 삭제가 '${log.at(-1)}' 단계에서 막힘 → ${e.code || ''} ${e.message.split('\n')[0]}`); }
// 남은 문서가 없는지(규칙을 끄고 확인)
let left = [];
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore(), out = [];
  const paths = [`classes/${CID}`, `joinCodes/${CODE}`, `enrollments/s1_${CID}`, `enrollments/s2_${CID}`, `enrollments/s1_${CID}/events/e1`, `classes/${CID}/questions/q1`, `classes/${CID}/questions/q1/replies/r1`, `classes/${CID}/questions/q2/replies/r1`, `classes/${CID}/weeks/w1`, `classes/${CID}/weeks/w1/submissions/s1/revisions/1`, `classes/${CID}/weeks/w1/quizResults/s1/attempts/a1`, `classes/${CID}/notices/n1`, `classes/${CID}/noticeReads/s1`, `classes/${CID}/studentGoals/s1`, `classes/${CID}/teacherNotes/s1`, `classes/${CID}/members/s1`];
  for (const p of paths) if ((await getDoc(doc(db, p))).exists()) out.push(p);
  const u = (await getDoc(doc(db, 'users/s1'))).data();
  if (u?.assignedClassId === CID) out.push('users/s1.assignedClassId');
  left = out;
});
results.push(left.length ? `✗ 삭제 뒤 남은 기록: ${left.join(', ')}` : '✓ 삭제 뒤 남은 기록 없음(수강 코드·수강 기록·학생 소속반 표시 포함)');

console.log('\n반 영구 삭제 규칙 테스트');
results.forEach(r => console.log(r));
await env.cleanup();
if (results.some(r => r.startsWith('✗'))) process.exit(1);
