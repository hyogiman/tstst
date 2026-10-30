// 알림 문구·판단 단위 테스트. 실행: cd functions && npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const n = require('../notify');

const ctx = { className: '스페인어 기초반 2기', weekLabel: '3차시 · estar 동사와 기분', badge: 2, multiClass: false };

test('새 질문: 학생 이름 + 질문 첫 줄, 질문 화면으로 가는 route, 질문마다 tag', () => {
  const m = n.questionMessage({ cid: 'c1', qid: 'q 1', question: { studentName: '이준호', title: 'ser와 estar 차이\n둘째 줄', content: '본문' }, ctx: { ...ctx, weekLabel: '' } });
  assert.deepEqual(m, { kind: 'question', tag: 'q-c1-q 1', badge: '2', title: '❓ 이준호 · 새 질문', body: 'ser와 estar 차이', route: 'questions?class=c1&q=q%201' });
});

test('피드백에서 보낸 질문은 차시·과제/복습 표시, 반이 둘 이상이면 반 이름', () => {
  const m = n.questionMessage({ cid: 'c1', qid: 'q1', question: { studentName: '박서연', title: '', content: '피드백의 ll 발음이 궁금해요', weekId: 'w3', context: 'assignment' }, ctx: { ...ctx, multiClass: true } });
  assert.equal(m.title, '❓ 박서연 · 새 질문 (3차시 과제)');
  assert.equal(m.body, '피드백의 ll 발음이 궁금해요 · 스페인어 기초반 2기');
});

test('추가 질문: 학생 글만 알림(강사 답글은 null), 같은 질문은 같은 tag', () => {
  const question = { studentName: '이준호', title: 'ser와 estar', weekId: 'w3', context: 'quiz' };
  assert.equal(n.replyMessage({ cid: 'c1', qid: 'q1', reply: { role: 'admin', text: '답변' }, question, ctx }), null);
  const m = n.replyMessage({ cid: 'c1', qid: 'q1', reply: { role: 'student', author: '이준호', text: '그럼 estoy는요?' }, question, ctx });
  assert.deepEqual([m.kind, m.tag, m.title, m.body, m.route], ['reply', 'q-c1-q1', '💬 이준호 · 추가 질문 (3차시 복습)', '그럼 estoy는요?', 'questions?class=c1&q=q1']);
});

test('과제 제출 판단: 새 제출 · 다시 제출(회차 증가)만, 피드백·확인 시각 변경은 무시', () => {
  assert.deepEqual(n.submissionChange(null, { revision: 1 }), { revised: false });
  assert.deepEqual(n.submissionChange(null, {}), { revised: false }); // 회차 없는 이전 형식
  assert.deepEqual(n.submissionChange({ revision: 1 }, { revision: 2 }), { revised: true });
  assert.deepEqual(n.submissionChange({}, { revision: 2 }), { revised: true });
  assert.equal(n.submissionChange({ revision: 2 }, { revision: 2, feedbacks: [{ text: '좋아요' }] }), null);
  assert.equal(n.submissionChange({ revision: 2 }, { revision: 2, studentSeenFeedbackAt: 1 }), null);
  assert.equal(n.submissionChange({ revision: 2 }, null), null); // 삭제
});

test('과제 제출 알림: 묶음 tag, 이름·차시·수정본 여부를 따로 담아 기기에서 합칠 수 있게', () => {
  const m = n.submissionMessage({ cid: 'c1', wid: 'w3', uid: 's1', submission: { studentName: '김민지', text: 'Hoy estoy cansada.' }, change: { revised: true }, ctx });
  assert.deepEqual(m, { kind: 'submission', tag: 'submissions', badge: '2', name: '김민지', session: '3차시', revised: '1', className: '', title: '📝 김민지 · 3차시 수정본 제출', body: 'Hoy estoy cansada.', route: 'feedback?class=c1&week=w3&uid=s1' });
  const audio = n.submissionMessage({ cid: 'c1', wid: 'w3', uid: 's2', submission: { studentName: '이준호', text: '', audioPath: 'x.webm' }, change: { revised: false }, ctx });
  assert.deepEqual([audio.title, audio.body], ['📝 이준호 · 3차시 과제 제출', '음성으로 제출했어요']);
});

test('데이터 메시지 값은 모두 문자열(FCM 조건)', () => {
  const m = n.questionMessage({ cid: 'c1', qid: 'q1', question: { studentName: 'a', title: 't' }, ctx: { ...ctx, badge: 0 } });
  assert.ok(Object.values(m).every(v => typeof v === 'string'));
  assert.equal(m.badge, '0');
});

test('시험 알림: testRequestedAt이 새로 바뀐 경우만', () => {
  const ts = ms => ({ toMillis: () => ms });
  assert.equal(n.testRequested({}, { testRequestedAt: ts(5) }), true);
  assert.equal(n.testRequested({ testRequestedAt: ts(5) }, { testRequestedAt: ts(5) }), false);
  assert.equal(n.testRequested({ testRequestedAt: ts(5) }, { testRequestedAt: ts(9), lastSeenAt: ts(9) }), true);
  assert.equal(n.testRequested({ testRequestedAt: { seconds: 1, nanoseconds: 0 } }, { testRequestedAt: { seconds: 1, nanoseconds: 0 }, token: 'new' }), false);
  assert.equal(n.testRequested({}, { lastSeenAt: ts(9) }), false);
});

test('첫 줄 자르기: 80자 넘으면 줄임표', () => {
  assert.equal(n.firstLine('\n\n  안녕  \n둘째'), '안녕');
  assert.equal(n.firstLine('가'.repeat(100)).length, 80);
  assert.ok(n.firstLine('가'.repeat(100)).endsWith('…'));
});
