// 테스트 전용 Messaging 모의 구현: 알림 주소(FCM 토큰)를 돌려주고 호출을 기록합니다. 실제 알림은 보내지 않습니다.
import { state } from './mock-store.js';

let serial = 0;
export function getMessaging() { return { type: 'messaging' }; }
export async function isSupported() { return state.messagingSupported !== false; }
export async function getToken(messaging, options = {}) {
  (state.tokenRequests ||= []).push({ vapidKey: options.vapidKey || '', withRegistration: !!options.serviceWorkerRegistration });
  return state.mockToken || (state.mockToken = 'mock-token-' + (++serial));
}
export async function deleteToken() { state.mockToken = null; return true; }
export function onMessage() { return () => {}; }

globalThis.__mock = Object.assign(globalThis.__mock || {}, {
  tokenRequests: () => (state.tokenRequests || []).slice(),
  setMessagingSupported: on => { state.messagingSupported = !!on; },
  rotateToken: () => { state.mockToken = 'mock-token-' + (++serial); },
});
