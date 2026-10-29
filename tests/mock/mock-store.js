// 테스트 전용: Firebase(Auth·Firestore·Storage)를 흉내 내는 메모리 저장소.
// 운영 코드에서는 절대 불러오지 않습니다. tests/lib/harness.cjs가 gstatic 요청을 가로채 이 파일을 제공합니다.
// 보안 규칙은 핵심 일부(수강 등록·반 접근)만 흉내 냅니다.
// window.__MOCK_RULES__ = 'v1'(처음 받은 규칙) | 'v2'(2026-10-29 게시, = 'current') | 'v3'(이번 수정안, = 'proposed')

const SENTINEL = Symbol('mock-sentinel');
export const state = (globalThis.__mockState ||= {
  docs: new Map(),
  listeners: new Set(),
  writes: [],
  uploads: [],
  deletedFiles: [],
  files: new Map(),
  seedFiles: {},
  authCallbacks: [],
  authUsers: [],
  user: null,
  rulesMode: 'current',
  seq: 0,
  readFailures: [],
});

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)); }
  static fromDate(d) { return Timestamp.fromMillis(+d); }
  static now() { return Timestamp.fromMillis(Date.now()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  isEqual(o) { return o instanceof Timestamp && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
  toJSON() { return { __ts: this.toMillis() }; }
}

export const sentinel = {
  serverTimestamp: () => ({ [SENTINEL]: 'ts' }),
  arrayUnion: (...values) => ({ [SENTINEL]: 'union', values }),
  deleteField: () => ({ [SENTINEL]: 'delete' }),
};
const isSentinel = (v, kind) => !!v && typeof v === 'object' && v[SENTINEL] === kind;
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !v[SENTINEL];

export function clone(v) {
  if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
}
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    const o = {}; for (const k of Object.keys(v)) o[k] = revive(v[k]); return o;
  }
  return v;
}
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function resolve(v, old) {
  if (isSentinel(v, 'ts')) return Timestamp.now();
  if (isSentinel(v, 'union')) {
    const base = Array.isArray(old) ? clone(old) : [];
    for (const x of v.values) if (!base.some(b => deepEqual(b, x))) base.push(resolve(x));
    return base;
  }
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (v instanceof Timestamp) return clone(v);
  if (Array.isArray(v)) return v.map(x => resolve(x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) { if (isSentinel(v[k], 'delete')) continue; o[k] = resolve(v[k], old?.[k]); }
    return o;
  }
  return v;
}
function mergeDeep(target, patch) {
  const out = clone(target || {});
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (isSentinel(v, 'delete')) delete out[k];
    else if (isPlainObject(v) && isPlainObject(out[k])) out[k] = mergeDeep(out[k], v);
    else out[k] = resolve(v, out[k]);
  }
  return out;
}
function applyUpdate(target, patch) {
  const out = clone(target);
  for (const key of Object.keys(patch)) {
    const parts = key.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) { if (!isPlainObject(node[parts[i]])) node[parts[i]] = {}; node = node[parts[i]]; }
    const last = parts.at(-1), v = patch[key];
    if (isSentinel(v, 'delete')) delete node[last];
    else node[last] = resolve(v, node[last]);
  }
  return out;
}

// ---------- 초기 데이터 ----------
export function seedOnce() {
  if (state.seeded) return;
  state.seeded = true;
  const seed = globalThis.__MOCK_SEED__ || { docs: {}, authUsers: [], files: {} };
  state.rulesMode = globalThis.__MOCK_RULES__ || 'current';
  for (const [path, data] of Object.entries(seed.docs || {})) state.docs.set(path, revive(data));
  state.authUsers = (seed.authUsers || []).map(u => ({ ...u }));
  state.seedFiles = seed.files || {};
  const uid = globalThis.__MOCK_USER__;
  const found = state.authUsers.find(u => u.uid === uid);
  state.user = found ? makeUser(found) : null;
}
export function makeUser(u) {
  return { uid: u.uid, email: u.email, displayName: u.displayName || null, emailVerified: true, async getIdToken() { return 'mock-token'; } };
}
export function autoId() { state.seq += 1; return 'auto' + String(state.seq).padStart(4, '0') + Math.random().toString(36).slice(2, 6); }

// ---------- 보안 규칙(일부) 흉내 ----------
const RULE_VERSIONS = { v1: 1, v2: 2, v3: 3, current: 2, proposed: 3 };
// 지금 흉내 내는 규칙이 해당 버전 이상인지
export function rulesAt(v) { return (RULE_VERSIONS[state.rulesMode] ?? 3) >= RULE_VERSIONS[v]; }
export function permissionError(message) { return Object.assign(new Error('Missing or insufficient permissions. ' + (message || '')), { code: 'permission-denied' }); }
function me() { return state.user?.uid || null; }
function isAdmin() { const u = me(); return !!u && state.docs.get('users/' + u)?.role === 'admin'; }
function memberOf(cid) {
  const u = me(); if (!u) return false;
  const e = state.docs.get(`enrollments/${u}_${cid}`);
  const c = state.docs.get('classes/' + cid);
  return !!e && e.status === 'active' && !!c && c.archived === false;
}
// v3: 보관된 반도 수강했던 학생은 읽을 수 있음(쓰기는 운영 중인 반만)
function enrolledIn(cid) {
  const u = me(); if (!u) return false;
  const e = state.docs.get(`enrollments/${u}_${cid}`);
  return !!e && e.status === 'active';
}
function finishedAssigned(uid, assigned) {
  if (!assigned) return true;
  const e = state.docs.get(`enrollments/${uid}_${assigned}`);
  const c = state.docs.get('classes/' + assigned);
  return !e || e.status !== 'active' || !c || c.archived === true;
}
export function canReadDoc(path, data) {
  if (state.readFailures.some(rx => new RegExp(rx).test(path))) return false;
  const u = me(); if (!u) return false;
  if (isAdmin()) return true;
  const s = path.split('/');
  if (s[0] === 'users') return s[1] === u;
  if (s[0] === 'joinCodes') return true;
  if (s[0] === 'enrollments') return !data || data.uid === u;
  if (s[0] === 'classes') {
    const cid = s[1];
    if (!(rulesAt('v3') ? enrolledIn(cid) : memberOf(cid))) return false;
    if (s.length <= 2) return true;
    if (s[2] === 'teacherNotes') return false;
    if (s[2] === 'members') return true;
    if (s[2] === 'questions') {
      const q = state.docs.get(`classes/${cid}/questions/${s[3]}`);
      if (s.length <= 4) return !data || data.uid === u;
      return !!q && q.uid === u;
    }
    if (s[2] === 'weeks') {
      const w = state.docs.get(`classes/${cid}/weeks/${s[3]}`);
      if (s.length <= 4) return !data || data.published === true;
      if (!w || w.published !== true) return s[4] === 'attendance' && s[5] === u;
      return s[5] === u;
    }
  }
  return false;
}
export function checkWrite(op) {
  const u = me();
  if (!u) throw permissionError('signed out');
  const before = state.docs.get(op.path);
  const s = op.path.split('/');
  const admin = isAdmin();
  const after = op.type === 'delete' ? null : op.after;
  if (s[0] === 'enrollments') {
    const creating = !before && op.type !== 'delete';
    if (admin) {
      if (creating && !rulesAt('v2')) throw permissionError('admin enrollment create (v1 rules)');
      return;
    }
    if (!creating) throw permissionError('student enrollment update');
    if (after.uid !== u || after.status !== 'active' || s[1] !== `${u}_${after.classId}`) throw permissionError('enrollment shape');
    const cls = state.docs.get('classes/' + after.classId);
    if (!cls || cls.archived !== false || cls.joinCode !== after.joinCode) throw permissionError('enrollment class');
    const assigned = state.docs.get('users/' + u)?.assignedClassId;
    if (assigned && assigned !== after.classId) {
      if (!rulesAt('v2') || !finishedAssigned(u, assigned)) throw permissionError('already assigned to another class');
    }
    return;
  }
  if (s[0] === 'users' && !admin) {
    if (s[1] !== u) throw permissionError('other user');
    if (after && before && after.role !== before.role) throw permissionError('role change');
    const oldAssigned = before?.assignedClassId, newAssigned = after?.assignedClassId;
    if (after && newAssigned !== oldAssigned) {
      const e = state.docs.get(`enrollments/${u}_${newAssigned}`);
      if (!e || e.status !== 'active') throw permissionError('assignedClassId without active enrollment');
      if (oldAssigned !== undefined && (!rulesAt('v2') || !finishedAssigned(u, oldAssigned))) throw permissionError('assignedClassId already set');
    }
    return;
  }
  if (s[0] === 'classes' && !admin) {
    const cid = s[1];
    if (s.length <= 2) throw permissionError('class doc');
    if (!memberOf(cid)) throw permissionError('not a member');
    if (s[2] === 'teacherNotes') throw permissionError('teacher notes');
    if (s[2] === 'questions' && s.length === 4 && before) {
      if (!rulesAt('v3')) throw permissionError('student question update (v2 rules)');
    }
    if (s[2] === 'weeks' && s.length === 4) throw permissionError('week doc');
    if (s[2] === 'weeks' && s[4] === 'attendance') throw permissionError('attendance');
    if (s[2] === 'weeks' && s[5] && s[5] !== u) throw permissionError('other student record');
  }
}

// ---------- 쓰기 적용 + 실시간 알림 ----------
export function computeAfter(op) {
  const before = state.docs.get(op.path);
  if (op.type === 'delete') return null;
  if (op.type === 'set') return op.merge ? mergeDeep(before, op.data) : resolve(op.data);
  if (op.type === 'update') {
    if (!before) throw Object.assign(new Error('No document to update: ' + op.path), { code: 'not-found' });
    return applyUpdate(before, op.data);
  }
  throw new Error('unknown op ' + op.type);
}
export function commit(ops, { skipRules = false, source = 'local' } = {}) {
  const prepared = ops.map(op => ({ ...op, after: undefined }));
  // 규칙 검사는 일괄 쓰기 전 상태 기준(실제 규칙의 getAfter 일부 무시)
  for (const op of prepared) { op.after = computeAfter(op); if (!skipRules) checkWrite(op); }
  for (const op of prepared) {
    if (op.type === 'delete') state.docs.delete(op.path); else state.docs.set(op.path, op.after);
    state.writes.push({ type: op.type, path: op.path, source, at: Date.now() });
  }
  notify();
}
export function notify() { for (const l of state.listeners) l.check(); }
export function listenerCount() { return state.listeners.size; }
