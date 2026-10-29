// 테스트 전용 Firestore 모의 구현 (앱이 실제로 쓰는 API만)
import { state, seedOnce, Timestamp, sentinel, clone, autoId, canReadDoc, permissionError, commit, computeAfter, listenerCount } from './mock-store.js';

seedOnce();
export { Timestamp };

const cleanPath = parts => parts.flatMap(p => String(p).split('/')).filter(Boolean).join('/');
function docRef(path) {
  const segs = path.split('/');
  return { type: 'document', path, id: segs.at(-1), get parent() { return collRef(segs.slice(0, -1).join('/')); }, firestore: DB };
}
function collRef(path) { return { type: 'collection', path, id: path.split('/').at(-1), firestore: DB }; }
const DB = { type: 'firestore' };

export function getFirestore() { return DB; }
export function doc(parent, ...segs) {
  if (parent && parent.type === 'collection') return docRef(parent.path + '/' + (segs.length ? cleanPath(segs) : autoId()));
  if (parent && parent.type === 'document') return docRef(cleanPath([parent.path, ...segs]));
  return docRef(cleanPath(segs));
}
export function collection(parent, ...segs) {
  if (parent && parent.type === 'document') return collRef(cleanPath([parent.path, ...segs]));
  return collRef(cleanPath(segs));
}
export function where(field, op, value) { return { kind: 'where', field, op, value }; }
export function query(base, ...constraints) { return { type: 'query', path: base.path, constraints }; }
export const serverTimestamp = sentinel.serverTimestamp;
export const arrayUnion = sentinel.arrayUnion;
export const deleteField = sentinel.deleteField;

function fieldValue(data, field) { return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data); }
function docSnapshot(path) {
  const raw = state.docs.get(path);
  return {
    id: path.split('/').at(-1), ref: docRef(path),
    exists: () => raw !== undefined,
    data: () => (raw === undefined ? undefined : clone(raw)),
    get: f => clone(fieldValue(raw, f)),
  };
}
function collectionDocs(target) {
  const depth = target.path.split('/').length + 1;
  const prefix = target.path + '/';
  let paths = [...state.docs.keys()].filter(p => p.startsWith(prefix) && p.split('/').length === depth);
  for (const c of target.constraints || []) {
    if (c.op !== '==') throw new Error('mock supports only == queries');
    paths = paths.filter(p => deepEq(fieldValue(state.docs.get(p), c.field), c.value));
  }
  return paths.sort();
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function querySnapshot(target) {
  const docs = collectionDocs(target).map(docSnapshot);
  return { docs, size: docs.length, empty: docs.length === 0, forEach: fn => docs.forEach(fn) };
}
function assertRead(target) {
  if (target.type === 'document') {
    if (!canReadDoc(target.path, state.docs.get(target.path))) throw permissionError('read ' + target.path);
    return;
  }
  const paths = collectionDocs(target);
  if (!state.user) throw permissionError('signed out');
  for (const p of paths) if (!canReadDoc(p, state.docs.get(p))) throw permissionError('list ' + target.path);
  if (!paths.length && !canReadDoc(target.path + '/__probe__', null)) throw permissionError('list ' + target.path);
}
const tick = () => new Promise(r => setTimeout(r, 0));

export async function getDoc(ref) { await tick(); assertRead(ref); return docSnapshot(ref.path); }
export async function getDocs(target) { await tick(); assertRead(target); return querySnapshot(target); }
export async function setDoc(ref, data, options = {}) { await tick(); commit([{ type: 'set', path: ref.path, data, merge: !!options.merge }]); }
export async function updateDoc(ref, data) { await tick(); commit([{ type: 'update', path: ref.path, data }]); }
export async function addDoc(coll, data) { await tick(); const ref = doc(coll); commit([{ type: 'set', path: ref.path, data }]); return ref; }
export async function deleteDoc(ref) { await tick(); commit([{ type: 'delete', path: ref.path }]); }

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, options = {}) { ops.push({ type: 'set', path: ref.path, data, merge: !!options.merge }); return this; },
    update(ref, data) { ops.push({ type: 'update', path: ref.path, data }); return this; },
    delete(ref) { ops.push({ type: 'delete', path: ref.path }); return this; },
    async commit() { await tick(); commit(ops); },
  };
}
export async function runTransaction(db, fn) {
  const ops = [];
  const tx = {
    async get(ref) { assertRead(ref); return docSnapshot(ref.path); },
    set(ref, data, options = {}) { ops.push({ type: 'set', path: ref.path, data, merge: !!options.merge }); return tx; },
    update(ref, data) { ops.push({ type: 'update', path: ref.path, data }); return tx; },
    delete(ref) { ops.push({ type: 'delete', path: ref.path }); return tx; },
  };
  await tick();
  const result = await fn(tx);
  commit(ops);
  return result;
}

export function onSnapshot(target, onNext, onError) {
  const listener = {
    last: undefined, dead: false,
    check() {
      if (this.dead) return;
      let snap, key;
      try {
        assertRead(target);
        snap = target.type === 'document' ? docSnapshot(target.path) : querySnapshot(target);
        key = target.type === 'document' ? JSON.stringify(state.docs.get(target.path) ?? null) : JSON.stringify(collectionDocs(target).map(p => [p, state.docs.get(p)]));
      } catch (err) {
        if (this.last === '__error__') return;
        this.last = '__error__';
        setTimeout(() => { if (!this.dead) onError ? onError(err) : console.error(err); }, 0);
        return;
      }
      if (key === this.last) return;
      this.last = key;
      setTimeout(() => { if (!this.dead) onNext(snap); }, 0);
    },
  };
  state.listeners.add(listener);
  listener.check();
  return () => { listener.dead = true; state.listeners.delete(listener); };
}

// 테스트에서 쓰는 제어 도구
globalThis.__mock = Object.assign(globalThis.__mock || {}, {
  state,
  dump: path => clone(state.docs.get(path)),
  list: prefix => [...state.docs.keys()].filter(p => p.startsWith(prefix)).sort(),
  writes: () => state.writes.slice(),
  clearWrites: () => { state.writes.length = 0; },
  listenerCount,
  // 다른 기기(강사·학생)의 쓰기를 흉내 냄: 규칙 검사 없이 적용하고 실시간 알림 발생
  remoteWrite(path, data, { merge = true, remove = false } = {}) {
    commit([remove ? { type: 'delete', path } : { type: 'set', path, data, merge }], { skipRules: true, source: 'remote' });
  },
  failReads(pattern) { state.readFailures.push(pattern); },
  ts: ms => Timestamp.fromMillis(ms),
});
