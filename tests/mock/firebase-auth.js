// 테스트 전용 Auth 모의 구현
import { state, seedOnce, makeUser, autoId, notify } from './mock-store.js';

seedOnce();
const AUTH = { type: 'auth', get currentUser() { return state.user; } };
const authError = code => Object.assign(new Error(code), { code });
function emit() {
  notify(); // 로그인 상태가 바뀌면 열린 구독의 권한도 다시 평가
  for (const cb of state.authCallbacks) setTimeout(() => cb(state.user), 0);
}

export function getAuth() { return AUTH; }
export function onAuthStateChanged(auth, cb) {
  state.authCallbacks.push(cb);
  setTimeout(() => cb(state.user), 0);
  return () => { state.authCallbacks = state.authCallbacks.filter(x => x !== cb); };
}
export async function signInWithEmailAndPassword(auth, email, password) {
  const u = state.authUsers.find(x => x.email === email);
  if (!u || (u.password && u.password !== password)) throw authError('auth/invalid-credential');
  state.user = makeUser(u); emit();
  return { user: state.user };
}
export async function createUserWithEmailAndPassword(auth, email, password) {
  if (state.authUsers.some(x => x.email === email)) throw authError('auth/email-already-in-use');
  if (String(password).length < 6) throw authError('auth/weak-password');
  const u = { uid: 'new_' + autoId(), email, password, displayName: null };
  state.authUsers.push(u); state.user = makeUser(u); emit();
  return { user: state.user };
}
export async function updateProfile(user, { displayName }) {
  user.displayName = displayName;
  const u = state.authUsers.find(x => x.uid === user.uid); if (u) u.displayName = displayName;
}
export async function signOut() { state.user = null; emit(); }
export async function sendPasswordResetEmail() {}

globalThis.__mock = Object.assign(globalThis.__mock || {}, {
  async loginAs(uid) {
    const u = state.authUsers.find(x => x.uid === uid);
    state.user = u ? makeUser(u) : null; emit();
  },
});
