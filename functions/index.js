// 쎄뇨라유 강사 알림(2026-10-30 D14): 학생이 새 질문·추가 질문을 남기거나 과제를 내면(수정본 포함) 강사 기기로 웹 푸시를 보냅니다.
// 강사 기기 목록은 Firestore adminDevices/{기기ID}(강사 화면의 '알림 설정'에서 등록)에 있습니다.
// 알림 문구는 notify.js(순수 함수)가 만들고, 이 파일은 Firestore 이벤트를 받아 보내는 일만 합니다.
// 배포: 저장소 README 9장(Cloud Shell). 앱(화면 파일)을 다른 저장소로 옮겨도 이 함수들은 그대로 둡니다.
'use strict';
const { onDocumentCreated, onDocumentWritten, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const notify = require('./notify');

initializeApp();
// 지역은 정하지 않습니다. Firestore 트리거의 위치는 Firebase CLI가 데이터베이스 위치에 맞추고, 함수가 도는 지역은
// 배포 뒤 functions:list로 확인합니다(이 반 규모에서는 지역 차이로 생기는 지연·비용이 아주 작음).
// 동시에 뜨는 인스턴스는 3개까지로 막아 둡니다(갑자기 많이 실행되는 경우의 비용 안전장치).
setGlobalOptions({ maxInstances: 3 });
const db = getFirestore();

// 답할 질문 수(앱 아이콘 숫자, 운영 중인 반 전체)와 운영 중인 반이 둘 이상인지
async function openQuestions() {
  const active = await db.collection('classes').where('archived', '==', false).get();
  const counts = await Promise.all(active.docs.map(c => c.ref.collection('questions').where('needsTeacherReply', '==', true).count().get()
    .then(s => s.data().count).catch(err => { logger.warn('답할 질문 수를 세지 못했습니다', c.id, err); return 0; })));
  return { badge: counts.reduce((a, b) => a + b, 0), multiClass: active.size > 1 };
}
// 알림에 붙일 정보: 반 이름 · 차시 이름 · 답할 질문 수 · 운영 중인 반이 둘 이상인지
async function contextFor(cid, wid) {
  const [cls, week, open] = await Promise.all([db.doc(`classes/${cid}`).get(), wid ? db.doc(`classes/${cid}/weeks/${wid}`).get() : null, openQuestions()]);
  return { className: cls.get('name') || '', weekLabel: week?.exists ? week.get('label') || '' : '', ...open };
}

// 에뮬레이터(테스트)에서는 실제로 보내지 않고 _pushOutbox에 남깁니다. 배포된 함수에는 이 환경 변수가 없습니다.
const EMULATED = process.env.FUNCTIONS_EMULATOR === 'true';

// 강사 기기로 보내기. devices를 주지 않으면 등록된 기기 전체로 보냅니다.
async function sendToTeachers(data, devices) {
  const list = (devices || (await db.collection('adminDevices').get()).docs).filter(d => typeof d.get('token') === 'string' && d.get('token'));
  if (!list.length) return { sent: 0 };
  if (EMULATED) {
    await db.collection('_pushOutbox').add({ data, tokens: list.map(d => d.get('token')), at: FieldValue.serverTimestamp() });
    return { sent: list.length };
  }
  const res = await getMessaging().sendEachForMulticast({
    tokens: list.map(d => d.get('token')), data,
    // 안드로이드 절전 상태에서도 바로 보이도록 높은 우선순위, 하루 안에 못 받은 알림은 버립니다.
    webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
  });
  await Promise.all(res.responses.map((r, i) => {
    if (r.success) return null;
    if (notify.GONE_TOKEN_ERRORS.has(r.error?.code)) return list[i].ref.delete(); // 앱 삭제·알림 해제된 기기
    logger.warn('알림을 보내지 못했습니다', list[i].id, r.error?.code, r.error?.message);
    return null;
  }));
  return { sent: res.successCount, failed: res.failureCount };
}

exports.notifyNewQuestion = onDocumentCreated('classes/{cid}/questions/{qid}', async event => {
  const question = event.data?.data();
  if (!question) return;
  const { cid, qid } = event.params;
  const ctx = await contextFor(cid, question.weekId);
  await sendToTeachers(notify.questionMessage({ cid, qid, question, ctx }));
});

exports.notifyStudentReply = onDocumentCreated('classes/{cid}/questions/{qid}/replies/{rid}', async event => {
  const reply = event.data?.data();
  if (reply?.role !== 'student') return; // 강사 답글은 알리지 않음
  const { cid, qid } = event.params;
  const question = (await db.doc(`classes/${cid}/questions/${qid}`).get()).data() || {};
  const ctx = await contextFor(cid, question.weekId);
  const data = notify.replyMessage({ cid, qid, reply, question, ctx });
  if (data) await sendToTeachers(data);
});

exports.notifySubmission = onDocumentWritten('classes/{cid}/weeks/{wid}/submissions/{uid}', async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const change = notify.submissionChange(before, after);
  if (!change) return; // 피드백 저장·확인 시각 같은 변경은 알리지 않음
  const { cid, wid, uid } = event.params;
  const ctx = await contextFor(cid, wid);
  await sendToTeachers(notify.submissionMessage({ cid, wid, uid, submission: after, change, ctx }));
});

exports.sendTestNotification = onDocumentUpdated('adminDevices/{deviceId}', async event => {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (!notify.testRequested(before, after)) return;
  const { badge } = await openQuestions().catch(() => ({ badge: 0 }));
  await sendToTeachers(notify.testMessage({ badge }), [event.data.after]);
});
