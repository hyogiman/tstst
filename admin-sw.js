// 쎄뇨라유 강사 알림 서비스 워커(2026-10-30 D14). 강사 화면(admin.html)만 등록합니다.
// 앱이 꺼져 있어도 Firebase Cloud Messaging(FCM)이 보낸 데이터 메시지를 받아 알림을 띄우고, 누르면 강사 앱의 그 화면을 엽니다.
// 보내는 쪽: functions/index.js. 페이지 요청(fetch)은 가로채지 않으므로 학생 화면과 캐시에는 영향이 없습니다.
'use strict';
importScripts('push-view.js');

const asset = name => new URL(name, self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// FCM 웹 푸시 내용은 {data: {...}, from, fcmMessageId, ...} 형식의 JSON입니다(데이터 메시지의 값은 모두 문자열).
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch (e) { message = {}; }
  event.waitUntil(showPush(message.data || {}));
});

async function showPush(d) {
  const base = { icon: asset('senorayu-app-192.png'), badge: asset('senorayu-badge-96.png'), lang: 'ko', timestamp: Date.now() };
  if (d.kind === 'submission') {
    const [prev] = await self.registration.getNotifications({ tag: 'submissions' });
    const view = self.senorayuPush.submissionView(prev ? prev.data : null, d, Date.now());
    await self.registration.showNotification(view.title, { ...base, tag: 'submissions', body: view.body, renotify: view.renotify, data: view.data });
  } else {
    // 질문은 질문마다 알림 하나(같은 질문에 추가 질문이 오면 그 알림을 바꿈). 내용을 알 수 없는 메시지도 알림은 띄웁니다.
    await self.registration.showNotification(d.title || '쎄뇨라유', { ...base, tag: d.tag || 'senorayu', body: d.body || '새 소식이 있어요.', renotify: true, data: { route: d.route || 'overview' } });
  }
  // 앱 아이콘 숫자(답할 질문 수). 안드로이드는 이 기능이 없어 알림이 남아 있으면 점으로 표시됩니다.
  if (d.badge !== undefined && 'setAppBadge' in self.navigator) {
    const n = Number(d.badge) || 0;
    try { await (n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()); } catch (e) { /* 표시할 수 없는 환경 */ }
  }
}

// 알림을 누르면: 열려 있는 강사 앱이 있으면 그 창으로 가서 화면을 바꾸고, 없으면 그 화면으로 새로 엽니다.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || 'overview';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const admin = windows.find(c => new URL(c.url).pathname.endsWith('/admin.html'));
    if (admin) {
      await admin.focus();
      admin.postMessage({ type: 'senorayu:open', route });
      return;
    }
    await self.clients.openWindow(asset('admin.html#' + route));
  })());
});
