// 강사 알림 기기(adminDevices, 2026-10-30 D14) 규칙. 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/admin1'), { role: 'admin', displayName: '유진' });
  await setDoc(doc(db, 'users/admin2'), { role: 'admin', displayName: '보조 강사' });
  await setDoc(doc(db, 'users/s1'), { role: 'student', displayName: 's1' });
  await setDoc(doc(db, 'adminDevices/existing'), { uid: 'admin1', token: 'tok-old', label: 'Windows PC · Chrome' });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const adb = env.authenticatedContext('admin1').firestore(), adb2 = env.authenticatedContext('admin2').firestore();
const sdb = env.authenticatedContext('s1').firestore(), anon = env.unauthenticatedContext().firestore();
const device = extra => ({ uid: 'admin1', token: 'fcm-token-abc', label: '안드로이드 · Chrome · 설치한 앱', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), ...extra });

await check('강사: 이 기기 등록', () => setDoc(doc(adb, 'adminDevices/d1'), device()), true);
await check('강사: 알림 주소 바뀜(merge)', () => setDoc(doc(adb, 'adminDevices/d1'), { uid: 'admin1', token: 'fcm-token-new', label: '안드로이드 · Chrome', updatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() }, { merge: true }), true);
await check('강사: 테스트 알림 요청', () => updateDoc(doc(adb, 'adminDevices/d1'), { testRequestedAt: serverTimestamp() }), true);
await check('강사: 기기 목록 읽기', () => getDocs(collection(adb, 'adminDevices')), true);
await check('강사: 다른 기기 지우기', () => deleteDoc(doc(adb, 'adminDevices/existing')), true);
await check('강사: 다른 강사 uid로 등록 거부', () => setDoc(doc(adb, 'adminDevices/d2'), device({ uid: 'admin2' })), false);
await check('강사: 허용하지 않은 필드 거부', () => setDoc(doc(adb, 'adminDevices/d3'), device({ role: 'admin' })), false);
await check('강사: 빈 알림 주소 거부', () => setDoc(doc(adb, 'adminDevices/d4'), device({ token: '' })), false);
await check('강사: 너무 긴 기기 이름 거부', () => setDoc(doc(adb, 'adminDevices/d5'), device({ label: 'x'.repeat(81) })), false);
await check('다른 강사: 자기 기기 등록', () => setDoc(doc(adb2, 'adminDevices/d6'), device({ uid: 'admin2' })), true);
await check('수강생: 기기 목록 읽기 거부', () => getDocs(collection(sdb, 'adminDevices')), false);
await check('수강생: 기기 하나 읽기 거부', () => getDoc(doc(sdb, 'adminDevices/d1')), false);
await check('수강생: 기기 등록 거부', () => setDoc(doc(sdb, 'adminDevices/s1'), device({ uid: 's1' })), false);
await check('수강생: 기기 지우기 거부', () => deleteDoc(doc(sdb, 'adminDevices/d1')), false);
await check('로그인 안 함: 읽기 거부', () => getDoc(doc(anon, 'adminDevices/d1')), false);

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
