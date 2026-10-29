// 저장소의 firestore.rules를 Firestore 에뮬레이터에서 검증합니다(수강 등록·반 이동, D4).
// 실행: cd tests/rules && npm install && npm test   (Java 필요)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const results = [];
async function run(label, rulesFile, expectNew) {
  const env = await initializeTestEnvironment({ projectId: 'demo-tstst', firestore: { rules: readFileSync(rulesFile, 'utf8'), host: '127.0.0.1', port: 8085 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('users/admin1', { role: 'admin', displayName: '유진', email: 'teacher@example.com' });
    for (const [uid, assigned] of [['s1', 'c1'], ['s5', 'c3'], ['s6', null], ['s4', 'c1']])
      await put('users/' + uid, { role: 'student', displayName: uid, realName: uid, nickname: '', email: uid + '@example.com', ...(assigned ? { assignedClassId: assigned } : {}) });
    await put('classes/c1', { name: '기초반', joinCode: 'HOLA2026', archived: false });
    await put('classes/c2', { name: '회화반', joinCode: 'CHARLA26', archived: false });
    await put('classes/c3', { name: '왕초보반', joinCode: 'OLA2025', archived: true });
    const en = (uid, cid, status) => put(`enrollments/${uid}_${cid}`, { uid, classId: cid, studentName: uid, email: uid + '@example.com', joinCode: 'X', status, joinedAt: new Date() });
    await en('s1', 'c1', 'active'); await en('s5', 'c3', 'active'); await en('s4', 'c1', 'inactive');
  });
  const as = uid => env.authenticatedContext(uid, { email: uid === 'admin1' ? 'teacher@example.com' : uid + '@example.com' }).firestore();
  const entry = (uid, cid, code) => ({ uid, classId: cid, studentName: uid, email: uid + '@example.com', joinCode: code, status: 'active', joinedAt: serverTimestamp() });
  const check = async (name, promise, shouldPass) => {
    try { shouldPass ? await assertSucceeds(promise) : await assertFails(promise); results.push(`✓ [${label}] ${name}`); }
    catch (e) { results.push(`✗ [${label}] ${name} → ${e.message.split('\n')[0]}`); }
  };
  // 1) 처음 입장하는 학생: 두 규칙 모두 허용
  await check('신규 학생 s6 → 기초반 입장', setDoc(doc(as('s6'), 'enrollments/s6_c1'), entry('s6', 'c1', 'HOLA2026')), true);
  // 2) 보관된 반을 마친 학생이 다음 반 입장: 수정 규칙만 허용
  await check('종료된 반 학생 s5 → 기초반 입장', setDoc(doc(as('s5'), 'enrollments/s5_c1'), entry('s5', 'c1', 'HOLA2026')), expectNew);
  if (expectNew) await check('s5 assignedClassId → c1 변경', updateDoc(doc(as('s5'), 'users/s5'), { assignedClassId: 'c1' }), true);
  // 3) 수강 중인 학생이 다른 반에 입장: 두 규칙 모두 거부 (D4)
  await check('수강 중인 s1 → 회화반 입장 거부', setDoc(doc(as('s1'), 'enrollments/s1_c2'), entry('s1', 'c2', 'CHARLA26')), false);
  // 4) 수강 중지된 학생이 같은 반 등록을 되살리기: 거부
  await check('수강 중지 s4 → 같은 반 재활성 거부', setDoc(doc(as('s4'), 'enrollments/s4_c1'), entry('s4', 'c1', 'HOLA2026')), false);
  // 5) 수강 중지된 학생이 다른 반 입장: 수정 규칙만 허용
  await check('수강 중지 s4 → 회화반 입장', setDoc(doc(as('s4'), 'enrollments/s4_c2'), entry('s4', 'c2', 'CHARLA26')), expectNew);
  // 6) 강사의 반 이동(새 등록 생성 포함 일괄 쓰기): 수정 규칙만 허용
  const adb = as('admin1'), b = writeBatch(adb);
  b.update(doc(adb, 'enrollments/s1_c1'), { status: 'transferred' });
  b.set(doc(adb, 'enrollments/s1_c2'), entry('s1', 'c2', 'CHARLA26'));
  b.update(doc(adb, 'users/s1'), { assignedClassId: 'c2' });
  await check('강사 반 이동 일괄 쓰기', b.commit(), expectNew);
  // 7) 다른 사람 등록 만들기·역할 바꾸기: 거부
  await check('학생이 다른 학생 등록 생성 거부', setDoc(doc(as('s6'), 'enrollments/s1_c1x'), entry('s1', 'c1', 'HOLA2026')), false);
  await check('학생 role 변경 거부', updateDoc(doc(as('s6'), 'users/s6'), { role: 'admin' }), false);
  await env.cleanup();
}
await run('firestore.rules', new URL('../../firestore.rules', import.meta.url), true);
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
