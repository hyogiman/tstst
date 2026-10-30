// 강사 알림 묶기(2026-10-30 D14). 서비스 워커(admin-sw.js)가 알림을 그릴 때 쓰는 순수 함수입니다(테스트도 이 파일을 그대로 불러옴).
// 과제 제출·수정본 제출은 알림 하나로 묶습니다. 같은 알림(tag 'submissions')이 떠 있으면 이름을 합쳐 다시 그리고,
// 10분 안에 또 오면 소리·진동 없이 내용만 바꿉니다. 알림을 지우거나 누르면 묶음이 새로 시작됩니다.
(function (root) {
  'use strict';
  var REALERT_MS = 10 * 60 * 1000;
  function parse(route) {
    var parts = String(route || '').split('?');
    var params = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
    });
    return { page: parts[0], params: params };
  }
  // 여러 제출이 모두 같은 반(·차시)이면 그 화면으로, 아니면 과제·복습 관리 첫 화면으로
  function commonRoute(routes) {
    var list = routes.map(parse);
    if (!list.length) return 'feedback';
    var keep = ['class', 'week'].filter(function (key) {
      return list.every(function (r) { return r.params[key] && r.params[key] === list[0].params[key]; });
    });
    if (keep[0] !== 'class') return 'feedback';
    return 'feedback?' + keep.map(function (key) { return key + '=' + encodeURIComponent(list[0].params[key]); }).join('&');
  }
  // prev: 지금 떠 있는 묶음 알림의 data(없으면 null) · d: 새로 온 데이터 메시지 · now: 받은 시각(ms)
  function submissionView(prev, d, now) {
    var item = { name: d.name || '수강생', session: d.session || '', revised: d.revised === '1', className: d.className || '', route: d.route || 'feedback' };
    var items = ((prev && prev.items) || []).filter(function (x) {
      return !(x.name === item.name && x.session === item.session && x.className === item.className);
    }).concat([item]).slice(-30);
    var realert = !prev || now - (prev.alertAt || 0) >= REALERT_MS;
    var label = function (x) { return x.name + ' · ' + x.session + (x.revised ? ' 수정본' : '') + (x.className ? ' (' + x.className + ')' : ''); };
    var newest = items.slice().reverse();
    return {
      title: items.length === 1 ? (d.title || '📝 과제 제출') : '📝 과제 제출 ' + items.length + '건',
      body: items.length === 1 ? (d.body || label(item)) : newest.slice(0, 4).map(label).join(', ') + (items.length > 4 ? ' 외 ' + (items.length - 4) + '건' : ''),
      renotify: realert,
      data: { route: items.length === 1 ? item.route : commonRoute(items.map(function (x) { return x.route; })), items: items, alertAt: realert ? now : prev.alertAt },
    };
  }
  root.senorayuPush = { submissionView: submissionView, commonRoute: commonRoute, parse: parse, REALERT_MS: REALERT_MS };
})(typeof self !== 'undefined' ? self : globalThis);
