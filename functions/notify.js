// 강사 알림 내용 만들기(2026-10-30). Firebase를 불러오지 않는 순수 함수라 `npm test`(node --test)로 바로 시험합니다.
// 알림은 '데이터 메시지'로 보내고, 강사 기기의 서비스 워커(admin-sw.js)가 이 값으로 알림을 그립니다.
// route에는 앱 안의 화면 위치(예: questions?class=c1&q=q1)만 담습니다. 주소(도메인·경로)는 기기에 설치된 앱이 붙이므로,
// 앱을 다른 저장소·주소로 옮겨도 함수를 다시 배포하지 않아도 됩니다.
'use strict';

// 첫 줄만, 길면 줄임표(잠금 화면에는 학생 이름 + 질문 첫 줄을 보여 주기로 함, 2026-10-30 결정)
function firstLine(text, max = 80) {
  const line = String(text || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}
// '3차시 · ser 동사와 국적' → '3차시' (common.js shortLabel과 같은 규칙)
const shortLabel = label => String(label || '').split(' · ')[0].trim() || '차시';
// 질문의 차시 표시: '3차시', 피드백에서 보낸 질문은 '3차시 과제'·'3차시 복습' (common.js questionSessionTag와 같은 규칙)
function sessionTag(weekLabel, context) {
  if (!weekLabel) return '';
  return shortLabel(weekLabel) + (context === 'assignment' ? ' 과제' : context === 'quiz' ? ' 복습' : '');
}
const route = (page, params) => page + '?' + Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
// 반이 둘 이상 운영 중일 때만 본문 끝에 반 이름을 붙입니다.
const withClass = (text, ctx) => [text, ctx.multiClass ? ctx.className : ''].filter(Boolean).join(' · ');

// FCM 데이터 메시지는 값이 모두 문자열이어야 합니다.
function payload(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
}

// 새 질문: 질문 탭에서 쓴 질문과 '이 피드백에 질문하기' 모두
function questionMessage({ cid, qid, question, ctx }) {
  const tag = sessionTag(ctx.weekLabel, question.context);
  return payload({
    kind: 'question', tag: `q-${cid}-${qid}`, badge: ctx.badge,
    title: `❓ ${question.studentName || '수강생'} · 새 질문${tag ? ` (${tag})` : ''}`,
    body: withClass(firstLine(question.title) || firstLine(question.content), ctx),
    route: route('questions', { class: cid, q: qid }),
  });
}

// 추가 질문: 학생이 질문 대화에 남긴 글(강사 답글은 알리지 않음)
function replyMessage({ cid, qid, reply, question, ctx }) {
  if (reply?.role !== 'student') return null;
  const tag = sessionTag(ctx.weekLabel, question?.context);
  return payload({
    kind: 'reply', tag: `q-${cid}-${qid}`, badge: ctx.badge,
    title: `💬 ${reply.author || question?.studentName || '수강생'} · 추가 질문${tag ? ` (${tag})` : ''}`,
    body: withClass(firstLine(reply.text) || firstLine(question?.title), ctx),
    route: route('questions', { class: cid, q: qid }),
  });
}

// 과제 제출 문서가 바뀐 이유: 새 제출 → {revised:false}, 다시 제출(회차 증가) → {revised:true}, 그 밖(피드백·확인 시각 등) → null
function submissionChange(before, after) {
  if (!after) return null;
  const rev = d => Number(d?.revision) || 1;
  if (!before) return { revised: rev(after) > 1 };
  return rev(after) > rev(before) ? { revised: true } : null;
}

// 과제 제출·수정본 제출. 여러 건은 강사 기기에서 한 알림으로 묶습니다(admin-sw.js가 같은 tag의 알림에 합침).
function submissionMessage({ cid, wid, uid, submission, change, ctx }) {
  return payload({
    kind: 'submission', tag: 'submissions', badge: ctx.badge,
    name: submission.studentName || '수강생', session: shortLabel(ctx.weekLabel), revised: change.revised ? '1' : '0',
    className: ctx.multiClass ? ctx.className : '',
    title: `📝 ${submission.studentName || '수강생'} · ${shortLabel(ctx.weekLabel)} ${change.revised ? '수정본 제출' : '과제 제출'}`,
    body: withClass(firstLine(submission.text) || (submission.audioPath ? '음성으로 제출했어요' : ''), ctx),
    route: route('feedback', { class: cid, week: wid, uid }),
  });
}

// 시험 알림: 강사가 알림 설정에서 [테스트 알림]을 누르면 그 기기 문서의 testRequestedAt이 바뀝니다.
const millis = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : t && typeof t.seconds === 'number' ? t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6) : 0;
function testRequested(before, after) {
  const now = millis(after?.testRequestedAt);
  return !!now && now !== millis(before?.testRequestedAt);
}
function testMessage({ badge }) {
  return payload({ kind: 'test', tag: 'test', badge, title: '🔔 알림 테스트', body: '이 기기로 쎄뇨라유 알림이 잘 와요.', route: 'overview' });
}

// 더 이상 쓸 수 없는 기기 주소(앱 삭제·알림 해제 등). 이 오류면 기기 목록에서 지웁니다.
const GONE_TOKEN_ERRORS = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

module.exports = { firstLine, shortLabel, sessionTag, questionMessage, replyMessage, submissionChange, submissionMessage, testRequested, testMessage, GONE_TOKEN_ERRORS };
