// 테스트 전용 Storage 모의 구현
import { state, seedOnce, rulesAt } from './mock-store.js';

seedOnce();
const notFound = path => Object.assign(new Error('Object not found: ' + path), { code: 'storage/object-not-found' });

// 무음 WAV(초 단위)를 만들어 재생 가능한 음성 URL로 사용
function silentWav(seconds = 1) {
  const rate = 8000, n = rate * seconds, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true); for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function placeholderImage(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640"><rect width="100%" height="100%" fill="#f3ebe4"/><text x="50%" y="50%" text-anchor="middle" font-size="44" fill="#9a1b32" font-family="sans-serif">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const seededUrl = {};
function seededFile(path) {
  const kind = state.seedFiles[path];
  if (!kind) return null;
  if (!seededUrl[path]) seededUrl[path] = kind === 'audio' ? silentWav(2) : kind === 'image' ? placeholderImage('수업 안내 이미지') : kind === 'video' ? '' : 'data:text/plain,mock';
  return seededUrl[path];
}

export function getStorage() { return { type: 'storage' }; }
export function ref(storage, path) { return { fullPath: path, name: String(path).split('/').at(-1) }; }
export function uploadBytesResumable(r, file, metadata = {}) {
  return {
    on(event, next, error, complete) {
      setTimeout(() => {
        try {
          if (!state.user) throw Object.assign(new Error('unauthorized'), { code: 'storage/unauthorized' });
          const total = file.size || 1;
          next?.({ bytesTransferred: Math.floor(total / 2), totalBytes: total });
          next?.({ bytesTransferred: total, totalBytes: total });
          state.files.set(r.fullPath, { blob: file, contentType: metadata.contentType || file.type });
          state.uploads.push({ path: r.fullPath, name: file.name, size: file.size, type: file.type, at: Date.now() });
          complete?.();
        } catch (e) { error?.(e); }
      }, 15);
    },
  };
}
export async function getDownloadURL(r) {
  (state.urlRequests ||= []).push(r.fullPath);
  // v3 규칙: 보관된 반의 강의 영상은 강사만 열 수 있음
  const video = String(r.fullPath).match(/^classes\/([^/]+)\/previews\/[^/]+\/video\//);
  if (video && rulesAt('v3')) {
    const uid = state.user?.uid, admin = state.docs.get('users/' + uid)?.role === 'admin';
    const e = state.docs.get(`enrollments/${uid}_${video[1]}`), c = state.docs.get('classes/' + video[1]);
    if (!admin && !(e?.status === 'active' && c?.archived === false)) throw Object.assign(new Error('unauthorized'), { code: 'storage/unauthorized' });
  }
  const f = state.files.get(r.fullPath);
  if (f) return (f.url ||= URL.createObjectURL(f.blob));
  const seeded = seededFile(r.fullPath);
  if (seeded !== null) return seeded;
  throw notFound(r.fullPath);
}
export async function deleteObject(r) {
  if (!state.files.has(r.fullPath) && !state.seedFiles[r.fullPath]) throw notFound(r.fullPath);
  state.files.delete(r.fullPath); delete state.seedFiles[r.fullPath];
  state.deletedFiles.push(r.fullPath);
}

globalThis.__mock = Object.assign(globalThis.__mock || {}, {
  uploads: () => state.uploads.slice(),
  deletedFiles: () => state.deletedFiles.slice(),
  urlRequests: () => (state.urlRequests || []).slice(),
});
