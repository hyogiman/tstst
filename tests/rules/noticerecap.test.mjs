// 공지사항(notices · noticeReads)과 복습 수업 영상(recaps 경로) 규칙. 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});
await env.clearFirestore();
await env.clearStorage();
const OLD = Timestamp.fromMillis(Date.UTC(2026, 9, 1, 12));
const VIDEO = new Uint8Array([0, 0, 0, 1]);
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore(), st = ctx.storage();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put('users/admin1', { role: 'admin', displayName: '유진' });
  for (const uid of ['s1', 's4', 's5']) await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com' });
  await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
  await put('classes/c3', { name: '왕초보반', joinCode: 'OLA2025', archived: true });
  const en = (uid, cid, status) => put(`enrollments/${uid}_${cid}`, { uid, classId: cid, studentName: uid, email: uid + '@example.com', joinCode: 'X', status, joinedAt: OLD });
  await en('s1', 'c1', 'active'); await en('s4', 'c1', 'inactive'); await en('s5', 'c3', 'active');
  const notice = { title: '다음 주 휴강', body: '11월 5일 수업은 쉽니다.', pinned: false, createdAt: OLD, updatedAt: OLD, createdBy: 'admin1', authorName: '유진' };
  await put('classes/c1/notices/n1', notice);
  await put('classes/c3/notices/n2', { ...notice, title: '수료 안내' });
  for (const path of ['classes/c1/recaps/w1/video/class.mp4', 'classes/c3/recaps/ow1/video/class.mp4'])
    await uploadBytes(ref(st, path), VIDEO, { contentType: 'video/mp4' });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const admin = env.authenticatedContext('admin1'), s1 = env.authenticatedContext('s1'), s4 = env.authenticatedContext('s4'), s5 = env.authenticatedContext('s5');
const adb = admin.firestore(), db1 = s1.firestore(), db4 = s4.firestore(), db5 = s5.firestore();
const N = 'classes/c1/notices';
const draft = extra => ({ title: '교재 안내', body: '3과까지 읽어 오세요.\nhttps://example.com', pinned: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: 'admin1', authorName: '유진', ...extra });

// --- 공지: 강사가 쓰고 수강생이 읽음 ---
await check('강사: 공지 올리기', () => addDoc(collection(adb, N), draft()), true);
await check('강사: 내용 없이 제목만', () => addDoc(collection(adb, N), draft({ body: '' })), true);
await check('강사: 제목 없음 거부', () => addDoc(collection(adb, N), draft({ title: '' })), false);
await check('강사: 제목 100자 초과 거부', () => addDoc(collection(adb, N), draft({ title: 'a'.repeat(101) })), false);
await check('강사: 내용 5000자 초과 거부', () => addDoc(collection(adb, N), draft({ body: 'a'.repeat(5001) })), false);
await check('강사: 고정 값이 참/거짓이 아니면 거부', () => addDoc(collection(adb, N), draft({ pinned: 'yes' })), false);
await check('강사: 허용하지 않은 필드 거부', () => addDoc(collection(adb, N), draft({ sendSms: true })), false);
await check('강사: 고정만 바꾸기', () => updateDoc(doc(adb, `${N}/n1`), { pinned: true }), true);
await check('수강생: 공지 목록 읽기', () => getDocs(collection(db1, N)), true);
await check('수강생: 공지 쓰기 거부', () => addDoc(collection(db1, N), draft()), false);
await check('수강생: 공지 고치기 거부', () => updateDoc(doc(db1, `${N}/n1`), { title: '바꿈' }), false);
await check('수강 중지 학생: 공지 읽기 거부', () => getDocs(collection(db4, N)), false);
await check('보관된 반 학생: 그 반 공지 읽기', () => getDocs(collection(db5, 'classes/c3/notices')), true);
await check('보관된 반 학생: 다른 반 공지 읽기 거부', () => getDocs(collection(db5, N)), false);

// --- 공지 확인 시각: 본인 것만, 서버 시각만 ---
const R = 'classes/c1/noticeReads';
await check('수강생: 확인 시각 남기기(서버 시각)', () => setDoc(doc(db1, `${R}/s1`), { seenAt: serverTimestamp() }), true);
await check('수강생: 기기 시각으로 남기기 거부', () => setDoc(doc(db1, `${R}/s1`), { seenAt: Timestamp.fromMillis(Date.now() + 86400000) }), false);
await check('수강생: 다른 학생 확인 시각 거부', () => setDoc(doc(db1, `${R}/s4`), { seenAt: serverTimestamp() }), false);
await check('수강생: 허용하지 않은 필드 거부', () => setDoc(doc(db1, `${R}/s1`), { seenAt: serverTimestamp(), read: ['n1'] }), false);
await check('수강생: 내 확인 시각 읽기', () => getDoc(doc(db1, `${R}/s1`)), true);
await check('수강생: 확인 시각 목록 거부', () => getDocs(collection(db1, R)), false);
await check('강사: 확인 시각 목록(읽음 수)', () => getDocs(collection(adb, R)), true);
await check('보관된 반 학생: 확인 시각 쓰기 거부(읽기 전용)', () => setDoc(doc(db5, 'classes/c3/noticeReads/s5'), { seenAt: serverTimestamp() }), false);
await check('강사: 공지 지우기', () => deleteDoc(doc(adb, `${N}/n1`)), true);

// --- 복습 수업 영상: 예습 영상과 같은 조건 ---
const V = 'classes/c1/recaps/w1/video';
await check('강사: 복습 영상 올리기', () => uploadBytes(ref(admin.storage(), `${V}/new.mp4`), VIDEO, { contentType: 'video/mp4' }), true);
await check('강사: 영상이 아닌 파일 거부', () => uploadBytes(ref(admin.storage(), `${V}/a.pdf`), VIDEO, { contentType: 'application/pdf' }), false);
await check('수강생: 복습 영상 올리기 거부', () => uploadBytes(ref(s1.storage(), `${V}/mine.mp4`), VIDEO, { contentType: 'video/mp4' }), false);
await check('운영 중인 반 수강생: 복습 영상 보기', () => getBytes(ref(s1.storage(), `${V}/class.mp4`)), true);
await check('수강 중지 학생: 복습 영상 보기 거부', () => getBytes(ref(s4.storage(), `${V}/class.mp4`)), false);
await check('보관된 반 학생: 복습 영상 보기 거부', () => getBytes(ref(s5.storage(), 'classes/c3/recaps/ow1/video/class.mp4')), false);
await check('강사: 보관된 반 복습 영상 보기', () => getBytes(ref(admin.storage(), 'classes/c3/recaps/ow1/video/class.mp4')), true);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
