// 반 폴더 목록(2026-10-30): 반·차시 영구 삭제 때 강사가 반 폴더의 파일을 모두 찾고, 내보내기 때 음성 파일을 내려받는 규칙.
// 실행: cd tests/rules && npm test
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, listAll, getBytes, deleteObject } from 'firebase/storage';

const env = await initializeTestEnvironment({
  projectId: 'demo-tstst',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});
await env.clearFirestore();
await env.clearStorage();
const BYTES = new Uint8Array([1, 2, 3]);
// 문서에 연결된 파일 + 연결이 끊긴 파일(삭제된 차시 w9의 영상, 저장하지 않은 복습 영상)
const FILES = {
  'classes/cf1/previews/w1/video/a.mp4': 'video/mp4', 'classes/cf1/previews/w1/file/b.pdf': 'application/pdf',
  'classes/cf1/recaps/w1/video/unsaved.mp4': 'video/mp4', 'classes/cf1/submissions/w1/s1/d.webm': 'audio/webm',
  'classes/cf1/feedback/w1/s1/e.webm': 'audio/webm', 'classes/cf1/previews/w9/video/orphan.mp4': 'video/mp4',
};
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/admin1'), { role: 'admin', displayName: '유진' });
  await setDoc(doc(db, 'users/s1'), { role: 'student', displayName: 's1' });
  await setDoc(doc(db, 'classes/cf1'), { name: '기초반', joinCode: 'HOLA2026', archived: false });
  await setDoc(doc(db, 'enrollments/s1_cf1'), { uid: 's1', classId: 'cf1', status: 'active' });
  for (const [path, contentType] of Object.entries(FILES)) await uploadBytes(ref(ctx.storage(), path), BYTES, { contentType });
});

const results = [];
const check = async (name, fn, shouldPass) => {
  try { shouldPass ? await assertSucceeds(fn()) : await assertFails(fn()); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name} → ${e.message.split('\n')[0]}`); }
};
const admin = env.authenticatedContext('admin1').storage(), s1 = env.authenticatedContext('s1').storage();
const walk = async (st, path, out = []) => { const r = await listAll(ref(st, path)); r.items.forEach(i => out.push(i.fullPath)); for (const p of r.prefixes) await walk(st, p.fullPath, out); return out; };

await check('강사: 반 폴더 전체 목록(하위 폴더까지)', () => walk(admin, 'classes/cf1'), true);
const all = await walk(admin, 'classes/cf1').catch(() => []);
results.push(JSON.stringify(all.sort()) === JSON.stringify(Object.keys(FILES).sort()) ? '✓ 강사: 연결이 끊긴 파일(삭제된 차시·저장 안 한 영상)까지 모두 찾음' : `✗ 찾은 파일: ${JSON.stringify(all)}`);
await check('강사: 차시 폴더 목록(차시 삭제)', () => walk(admin, 'classes/cf1/submissions/w1'), true);
await check('수강생: 반 폴더 목록 거부', () => listAll(ref(s1, 'classes/cf1')), false);
await check('수강생: 다른 학생 음성 폴더 목록 거부', () => listAll(ref(s1, 'classes/cf1/submissions/w1')), false);
await check('로그인 안 함: 반 폴더 목록 거부', () => listAll(ref(env.unauthenticatedContext().storage(), 'classes/cf1')), false);
await check('강사: 반 밖 폴더 목록 거부', () => listAll(ref(admin, 'other')), false);
// 목록 권한은 읽기·쓰기 권한을 넓히지 않음
await check('수강생: 목록 규칙이 생겨도 다른 학생 음성 읽기 거부', () => getBytes(ref(s1, 'classes/cf1/feedback/w1/s1x/none.webm')), false);
await check('수강생: 목록 규칙이 생겨도 반 폴더에 쓰기 거부', () => uploadBytes(ref(s1, 'classes/cf1/notes.txt'), BYTES, { contentType: 'text/plain' }), false);
// 내보내기: 강사가 학생 음성과 피드백 음성을 내려받음
await check('강사: 학생 과제 음성 내려받기(내보내기)', () => getBytes(ref(admin, 'classes/cf1/submissions/w1/s1/d.webm')), true);
await check('강사: 피드백 음성 내려받기(내보내기)', () => getBytes(ref(admin, 'classes/cf1/feedback/w1/s1/e.webm')), true);
// 반 삭제: 찾은 파일을 모두 지움(연결이 끊긴 영상 포함)
for (const path of Object.keys(FILES)) await check(`강사: 지우기 ${path.split('/').slice(2).join('/')}`, () => deleteObject(ref(admin, path)), true);
results.push((await walk(admin, 'classes/cf1').catch(() => ['?'])).length === 0 ? '✓ 반 삭제 뒤 반 폴더가 비어 있음' : '✗ 반 폴더에 파일이 남음');

await env.cleanup();
console.log(results.join('\n'));
if (results.some(r => r.startsWith('✗'))) process.exit(1);
