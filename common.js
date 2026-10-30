// 쎄뇨라유 스페인어 — 학생 화면(index.html)과 강사 화면(admin.html)이 함께 쓰는 코드입니다.
// 공통 기능은 이 파일 한 곳만 고치면 두 화면에 모두 반영됩니다.
// 불러오는 쪽: import { … } from './common.js?v=날짜'  (배포할 때 ?v= 값을 함께 올려 브라우저 캐시를 갱신하세요)
// ES module이므로 HTML 파일을 더블클릭(file://)으로 열면 동작하지 않습니다. 로컬에서는 정적 서버로 여세요(README 참고).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js';

// Firebase 웹 앱 설정(두 화면 공통). API key는 비밀 키가 아니며 보안은 Rules가 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyBVNCSbB4Bmrcc2lEgjvZirVNhJNce7r8E",
  authDomain: "senora-c9b84.firebaseapp.com",
  projectId: "senora-c9b84",
  storageBucket: "senora-c9b84.firebasestorage.app",
  messagingSenderId: "89833541051",
  appId: "1:89833541051:web:db34c49bc76f536c32c89e"
};
export const CONFIGURED = !firebaseConfig.apiKey.startsWith('PASTE_') && !firebaseConfig.projectId.startsWith('PASTE_');
export const app = CONFIGURED ? initializeApp(firebaseConfig) : null;
export const auth = CONFIGURED ? getAuth(app) : null;
export const db = CONFIGURED ? getFirestore(app) : null;
export const storage = CONFIGURED ? getStorage(app) : null;
export const $ = (s, el=document)=>el.querySelector(s);
export const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
export const esc = v => String(v??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ---------- 날짜·시간 (P0-05, D10) ----------
// 표시와 '시간대 없는 날짜 문자열' 해석은 모두 수업 운영 시간대로 합니다. 브라우저 시간대와 무관하게 같은 시각이 보입니다.
export const TIME_ZONE = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const zoneParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
});
// Date → 운영 시간대의 연·월·일·시·분·요일
export function partsInZone(date) {
  const p = {};
  for (const { type, value } of zoneParts.formatToParts(date)) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}
// 운영 시간대의 벽시계 시각 → Date (서머타임이 있는 시간대도 맞도록 두 번 보정)
function zonedToDate(y, mo, d, h = 0, mi = 0, sec = 0) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, sec);
  const offsetAt = t => { const p = partsInZone(new Date(t)); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; };
  let t = wall - offsetAt(wall);
  const second = offsetAt(t);
  if (wall - second !== t) t = wall - second;
  return new Date(t);
}
// Firestore Timestamp · Date · 밀리초 · ISO 문자열 · 시간대 없는 'YYYY-MM-DD[THH:mm]' 문자열을 Date로 바꿉니다.
// 시간대 없는 문자열은 운영 시간대(한국 시간)의 시각으로 해석합니다. new Date('YYYY-MM-DDTHH:mm')는 브라우저 시간대로 해석하므로 쓰지 않습니다.
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(+value) ? null : value;
  if (typeof value.toDate === 'function') { const d = value.toDate(); return Number.isNaN(+d) ? null : d; }
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === 'string') {
    const text = value.trim();
    const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (local) return zonedToDate(+local[1], +local[2], +local[3], +(local[4] || 0), +(local[5] || 0), +(local[6] || 0));
    const d = new Date(text);
    return Number.isNaN(+d) ? null : d;
  }
  return null;
}
// 예) 10월 30일 (목) 오후 11:59 · 올해가 아니면 연도를 붙입니다.
// options: time(시각 표시, 기본 true) · weekday(요일, 기본 true) · year('auto'|'always'|'never') · empty(값이 없을 때 문구)
export function formatDateTime(value, { time = true, weekday = true, year = 'auto', empty = '기록 없음' } = {}) {
  const d = toDate(value);
  if (!d) return empty;
  const p = partsInZone(d);
  const showYear = year === 'always' || (year === 'auto' && p.year !== partsInZone(new Date()).year);
  let out = `${showYear ? p.year + '년 ' : ''}${p.month}월 ${p.day}일`;
  if (weekday) out += ` (${WEEKDAYS[p.weekday]})`;
  if (time) out += ` ${p.hour < 12 ? '오전' : '오후'} ${p.hour % 12 || 12}:${String(p.minute).padStart(2, '0')}`;
  return out;
}
// 운영 시간대 기준 오늘 날짜 'YYYY-MM-DD'
export function todayKey(date = new Date()) {
  const p = partsInZone(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
export const fmt = value => formatDateTime(value);
// 두 날짜 키('YYYY-MM-DD') 사이의 일수(to - from)
export function daysBetween(fromKey, toKey) {
  const [a, b] = [fromKey, toKey].map(k => { const [y, m, d] = String(k).split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86400000);
}

// ---------- 차시 상태 (배치 08) ----------
// 'upcoming' 예정 · 'today' 오늘 · 'done' 지난 차시. 오늘은 운영 시간대(D10) 기준입니다.
// 날짜가 없는 차시는 출결 기록이 하나라도 있으면 'done', 없으면 'upcoming'.
export function sessionState(session, today = todayKey(), { hasAttendance = false } = {}) {
  const date = session?.date || session?.sessionDate || '';
  if (!date) return hasAttendance ? 'done' : 'upcoming';
  if (date === today) return 'today';
  return date < today ? 'done' : 'upcoming';
}
// '3차시 · 카페에서 주문하기' → '3차시' (dashboard.js의 shortLabel과 같은 규칙)
export const shortLabel = label => String(label || '').split(' · ')[0].trim() || '차시';
// 질문의 차시 표시(배치 10): '3차시', 피드백에서 보낸 질문은 '3차시 과제'·'3차시 복습'
export function questionSessionTag(q, label) {
  if (!q?.weekId || !label) return '';
  return shortLabel(label) + (q.context === 'assignment' ? ' 과제' : q.context === 'quiz' ? ' 복습' : '');
}
// 날짜 'YYYY-MM-DD' → '10월 30일 (금)'
export const sessionDateText = date => date ? formatDateTime(date, { time: false }) : '날짜 미정';

// ---------- 영상 링크 (배치 08, D9) ----------
// 유튜브 '일부 공개' 영상 등을 개인정보 보호 강화 모드(youtube-nocookie.com)로 임베드합니다. 허용한 주소만 받습니다.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
export function parseYouTube(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname)) return null;
  let id = '';
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
  else { const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/); id = m ? m[1] : ''; }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export const youtubeEmbedUrl = id => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;

// ---------- 상태 표시 (P0-07) ----------
// 상태는 색만으로 구분하지 않고 기호와 글자를 함께 씁니다.
// success ✓ 완료·정답·출석 · warning ! 대기 · danger ✕ 오답·불참 · neutral – 미입력·해당 없음 · brand(기호 없음) 상태가 아닌 라벨
const STATUS_SYMBOL = { success: '✓', warning: '!', danger: '✕', neutral: '–' };
export function statusPill(kind, text, attrs = '') {
  const symbol = STATUS_SYMBOL[kind];
  return `<span class="pill ${kind}"${attrs ? ' ' + attrs : ''}>${symbol ? `<span class="pill-symbol" aria-hidden="true">${symbol}</span>` : ''}${esc(text)}</span>`;
}
// 이미 그려진 배지의 상태만 바꿀 때
export function paintPill(el, kind, text) {
  if (!el) return;
  el.className = 'pill ' + kind;
  const symbol = STATUS_SYMBOL[kind];
  el.innerHTML = `${symbol ? `<span class="pill-symbol" aria-hidden="true">${symbol}</span>` : ''}${esc(text)}`;
}

// ---------- 질문 상태 (P0-03) ----------
// 답변 대기 판정은 이 함수 하나로 합니다(강사 목록·개수·대시보드 공통).
// needsTeacherReply가 없는 이전 질문은 status로 판단합니다.
export function needsReply(q) {
  if (!q) return false;
  if (typeof q.needsTeacherReply === 'boolean') return q.needsTeacherReply;
  return q.status !== 'answered';
}
// 최근 대화 시각(초). 방금 보낸 글처럼 서버 시각이 아직 정해지지 않은 값(null)은 가장 최근으로 봅니다.
export function lastActivity(q) {
  const stamp = v => v === null ? Number.MAX_SAFE_INTEGER : (toDate(v)?.getTime() || 0) / 1000;
  if (q && 'lastMessageAt' in q) return stamp(q.lastMessageAt);
  if (q && 'createdAt' in q) return stamp(q.createdAt);
  return 0;
}
export const byLastActivity = (a, b) => lastActivity(b) - lastActivity(a);

// ---------- 과제 피드백 상태 (P0-04) ----------
// 'none' 미제출 · 'pending' 피드백 없음 · 'rereview' 최신 제출에 대한 피드백 없음 · 'done' 피드백 완료
export function feedbackItems(d) {
  const list = [...(d?.feedbacks || [])]; // 배치 12(D7): 업로드 이전 버전의 단일 feedback 필드 호환은 제거했습니다.
  return list.filter(f => f && (f.text || f.audioPath));
}
export function reviewState(d) {
  if (!d) return 'none';
  const items = feedbackItems(d);
  if (!items.length) return 'pending';
  const revision = Number(d.revision) || 0;
  if (revision) return Math.max(...items.map(f => Number(f.forRevision) || 1)) >= revision ? 'done' : 'rereview';
  // 회차 정보가 없는 이전 문서: 마지막 피드백이 최근 제출보다 앞서면 재검토 대기
  const lastFeedback = Math.max(...items.map(f => toDate(f.createdAt)?.getTime() || 0));
  const submitted = toDate(d.latestSubmittedAt || d.submittedAt)?.getTime() || 0;
  return lastFeedback < submitted ? 'rereview' : 'done';
}
export const REVIEW_LABEL = { none: ['neutral', '미제출'], pending: ['warning', '피드백 대기'], rereview: ['warning', '재검토 대기'], done: ['success', '피드백 완료'] };

// ---------- 퀴즈 답안 (P1-02) ----------
// Firestore는 배열 안에 배열을 저장할 수 없습니다. 복수정답 답(예: [0,2])은
// answersById {문항ID: [선택 인덱스]}(맵 안의 배열은 저장 가능)와 answers ["2","0,2",…](문자열 목록)으로 저장합니다.
export function parseAnswer(a) {
  if (Array.isArray(a)) return a.map(Number);
  if (a === null || a === undefined || a === '') return [];
  if (typeof a === 'number') return [a];
  if (typeof a === 'string') return a.split(',').filter(x => x !== '').map(Number);
  return [];
}
export const encodeAnswer = a => parseAnswer(a).join(',');
// 응시 기록(entry)의 답을 문항 순서대로 [선택 인덱스 배열]로 돌려줍니다. 문항 ID가 있으면 ID로 맞춥니다.
export const questionKey = (q, i) => q?.id || 'idx' + i; // 문항 ID가 없는 이전 문항은 순서로 구분
export function answersFor(entry, questions) {
  const byId = entry?.answersById;
  return questions.map((q, i) => {
    const key = questionKey(q, i);
    return byId && key in byId ? parseAnswer(byId[key]) : parseAnswer(entry?.answers?.[i]);
  });
}
// 학생 화면의 채점 기준(학생 채점과 강사 문항 분석이 함께 씁니다). 구버전 {correctIndex} 문항도 읽습니다.
export function normalizeQuizQuestion(q = {}, index = 0) {
  const type = ['single', 'multiple', 'ox'].includes(q.type) ? q.type : 'single';
  const options = type === 'ox' ? ['O', 'X'] : (q.options || []);
  let correctIndices = Array.isArray(q.correctIndices) ? q.correctIndices.map(Number) : [Number(q.correctIndex ?? 0)];
  correctIndices = [...new Set(correctIndices.filter(i => i >= 0 && i < options.length))];
  return { ...q, id: questionKey(q, index), type, options, correctIndices };
}
// 복수정답은 정답을 모두, 정답만 골라야 정답입니다.
export function isCorrectAnswer(q, answer) {
  const a = Array.isArray(answer) ? answer : answer === null || answer === undefined ? [] : [answer];
  return a.length === q.correctIndices.length && a.every(i => q.correctIndices.includes(Number(i)));
}
// 퀴즈 버전 비교용: 제목·문항 ID 생성 방식과 무관한 문항 내용만 남깁니다.
export function quizContentKey(questions = []) {
  return JSON.stringify(questions.map(q => ({
    id: q.id || '', type: q.type || 'single', stem: q.stem || '', options: q.options || [],
    correctIndices: [...(q.correctIndices || [])].map(Number).sort((a, b) => a - b), explanation: q.explanation || '',
  })));
}

// ---------- 출결 (D2) ----------
// 출석은 '출석'·'불참' 두 가지만 씁니다. 이전 형식의 지각은 출석, 인정결석은 불참으로 읽고, 기록이 없으면 ''(미입력).
export const attendanceValue = status => status === 'present' || status === 'late' ? 'present' : status === 'absent' || status === 'excused' ? 'absent' : '';

// ---------- 수강 기간 (P1-04) ----------
// 그 날짜(운영 시간대 'YYYY-MM-DD')에 수강 중이었는지 판정합니다. 근거가 부족하면 estimated: true.
// events: [{type:'joined'|'stopped'|'resumed'|'transferred_out'|'transferred_in', at}]
const START_EVENTS = new Set(['joined', 'resumed', 'transferred_in']);
const END_EVENTS = new Set(['stopped', 'transferred_out']);
export const dateKeyOf = value => { const d = toDate(value); return d ? todayKey(d) : ''; };
export function wasActiveAt(enrollment, events = [], date) {
  if (!enrollment) return { active: false, estimated: false };
  if (!date) return { active: enrollment.status === 'active', estimated: true }; // 날짜 없는 차시: 현재 수강생 기준
  const joined = dateKeyOf(enrollment.joinedAt);
  const timeline = events.filter(e => e && (START_EVENTS.has(e.type) || END_EVENTS.has(e.type)) && dateKeyOf(e.at))
    .sort((a, b) => (toDate(a.at)?.getTime() || 0) - (toDate(b.at)?.getTime() || 0));
  if (!timeline.length) {
    const active = !!joined && joined <= date;
    return { active, estimated: enrollment.status !== 'active' };
  }
  // 첫 이벤트 전 상태: 첫 이벤트가 '시작'이면 그 전에는 수강 전, '끝'이면 등록일부터 수강 중이었다고 봅니다.
  let active = END_EVENTS.has(timeline[0].type) && !!joined && joined <= date;
  for (const e of timeline) {
    if (dateKeyOf(e.at) > date) break;
    active = START_EVENTS.has(e.type);
  }
  return { active, estimated: false };
}

// ---------- 음성 길이 (P1-06) ----------
// 음성 플레이어 + 길이(예: 0:42)
export function audioMarkup(path, duration) {
  const d = Number(duration) > 0 ? formatDuration(duration) : '';
  return `<div class="audio-row"><audio controls preload="none" data-media-path="${esc(path)}"></audio>${d ? `<span class="audio-duration" aria-label="길이 ${d}">${d}</span>` : ''}</div>`;
}
// 파일에서 길이(초)를 읽습니다. Chrome 녹음(webm)은 길이가 Infinity로 나오는 경우가 있어, 읽지 못하면 null.
export function readAudioDuration(file, timeoutMs = 4000) {
  return new Promise(resolve => {
    if (!file || typeof Audio === 'undefined') { resolve(null); return; }
    const url = URL.createObjectURL(file), audio = new Audio();
    const finish = v => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(Number.isFinite(v) && v > 0 ? Math.round(v) : null); };
    const timer = setTimeout(() => finish(NaN), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(NaN);
    audio.src = url;
  });
}
// ---------- 오류 문구 (P1-08) ----------
// 강사 화면은 원인을 찾을 수 있게 자세히, 학생 화면은 개발 용어 없이 '무엇이 안 됐는지 + 다음 행동'만 보여 줍니다.
// 기술 상세는 항상 console에만 남깁니다.
let errorAudience = 'admin';
export function setErrorAudience(audience) { errorAudience = audience === 'student' ? 'student' : 'admin'; }
const AUTH_MESSAGES = {
  'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일입니다.',
  'auth/weak-password': '비밀번호는 6자 이상으로 설정해 주세요.',
  'auth/invalid-email': '올바른 이메일을 입력해 주세요.',
  'auth/too-many-requests': '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
};
const ADMIN_MESSAGES = {
  ...AUTH_MESSAGES,
  'auth/unauthorized-domain': 'Firebase Authentication에서 현재 도메인을 승인해 주세요.',
  'permission-denied': '접근 권한이 없습니다. 보안 규칙(저장소의 firestore.rules) 게시 여부와 계정 권한을 확인해 주세요.',
  'storage/unauthorized': '파일 저장 권한이 없습니다. Storage 보안 규칙(storage.rules)을 확인해 주세요.',
  'storage/quota-exceeded': 'Storage 사용량 또는 요금제 제한을 확인해 주세요.',
  'unavailable': 'Firebase에 연결하지 못했습니다. 네트워크를 확인해 주세요.',
};
const STUDENT_MESSAGES = {
  ...AUTH_MESSAGES,
  'auth/unauthorized-domain': '이 주소에서는 로그인할 수 없어요. 선생님께 문의해 주세요.',
  'permission-denied': '권한이 없어 처리하지 못했어요. 선생님께 문의해 주세요.',
  'storage/unauthorized': '파일을 올리거나 열 권한이 없어요. 선생님께 문의해 주세요.',
  'storage/quota-exceeded': '지금은 파일을 올릴 수 없어요. 선생님께 문의해 주세요.',
  'storage/retry-limit-exceeded': '인터넷 연결이 불안정해 파일을 올리지 못했어요. 다시 시도해 주세요.',
  'storage/canceled': '파일 올리기가 취소되었어요.',
  'unavailable': '인터넷 연결이 불안정해요. 잠시 후 다시 시도해 주세요.',
  'deadline-exceeded': '응답이 늦어 처리하지 못했어요. 다시 시도해 주세요.',
};
export const ex = e => {
  console.error(e);
  const code = e?.code || '';
  const map = errorAudience === 'student' ? STUDENT_MESSAGES : ADMIN_MESSAGES;
  if (map[code]) return map[code];
  // 앱이 직접 만든 오류(코드 없음)는 이미 한국어 안내문입니다.
  if (!code && e?.message) return e.message;
  return errorAudience === 'student' ? '처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' : (e?.message || '처리 중 오류가 발생했습니다.');
};
let toastTimer; export function toast(message,bad=false){const box=$('#toast');if(!box)return;box.textContent=message;box.className='toast show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='toast',4200)}
export function loading(el){el.classList.add('loading');el.textContent='불러오는 중입니다'}
export function loaded(el,html){if(!el)return;el.classList.remove('loading');el.innerHTML=html}
// 공지 본문(2026-10-29): http(s) 주소만 링크로 바꾸고 나머지는 글자 그대로 둡니다. 새 탭으로 열고 원래 창에는 접근하지 못하게 합니다.
// 주소는 영문·숫자·URL 기호까지만 보고(바로 뒤 한글은 제외), 끝에 붙은 문장부호도 링크에서 뺍니다.
export function linkifyText(text) {
  const s = String(text ?? ''), rx = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  let out = '', last = 0, m;
  while ((m = rx.exec(s))) {
    const link = m[0].replace(/[.,;:!?')\]]+$/, '');
    out += esc(s.slice(last, m.index)) + `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)}</a>`;
    last = m.index + link.length; rx.lastIndex = last;
  }
  return out + esc(s.slice(last));
}
// 공지 정렬: 상단 고정 먼저, 그다음 최근에 올린 것부터
export function sortNotices(list) {
  const at = n => toDate(n.createdAt)?.getTime() || 0;
  return [...(list || [])].sort((a, b) => (b.pinned === true) - (a.pinned === true) || at(b) - at(a));
}
export function empty(title,detail=''){return `<div class="empty"><span class="symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l2.6-7.2a1.6 1.6 0 0 1 1.5-1.1h9.8a1.6 1.6 0 0 1 1.5 1.1L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/></svg></span><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;}
export function makeId(){return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));}
export const enId = (uid,cid)=>`${uid}_${cid}`;
export const isMedia = (file,kind) => kind==='audio'?file.type.startsWith('audio/'):kind==='image'?file.type.startsWith('image/'):kind==='video'?file.type.startsWith('video/'):true;
// D9: 복습용 강의 전체 영상을 올리므로 영상은 10GB까지(1080p 2시간 녹화도 대개 들어가는 크기). 바꾸면 storage.rules도 함께 고칩니다.
export const sizeLimit={audio:15*1024*1024,image:8*1024*1024,video:10*1024*1024*1024,file:20*1024*1024};
const sizeText=bytes=>bytes>=1024**3?`${Math.round(bytes/1024**3*10)/10}GB`:`${Math.round(bytes/1024**2)}MB`;
export const SIZE_LABEL=Object.fromEntries(Object.entries(sizeLimit).map(([k,v])=>[k,sizeText(v)]));
let uploading=0;
// 진행 중인 업로드 수(창 닫기·화면 이동 경고용)
export const uploadsInProgress=()=>uploading;
export async function uploadMedia(file,path,kind,progressEl){
  if(!file)throw Error('파일을 선택해 주세요.');
  if(!isMedia(file,kind))throw Error('선택한 파일 형식을 확인해 주세요.');
  if(file.size>sizeLimit[kind])throw Error(`파일 크기 제한을 초과했습니다. (최대 ${sizeText(sizeLimit[kind])})`);
  const r=storageRef(storage,path);
  uploading++;
  return new Promise((resolve,reject)=>{
    const task=uploadBytesResumable(r,file,{contentType:file.type||'application/octet-stream'});
    const started=Date.now();
    // 큰 영상을 위해 진행률과 남은 시간을 함께 보여 줍니다(배치 08, D9).
    task.on('state_changed',snap=>{
      if(!progressEl)return;
      const pct=snap.totalBytes?Math.round(snap.bytesTransferred/snap.totalBytes*100):0;
      const elapsed=(Date.now()-started)/1000,rate=elapsed>2?snap.bytesTransferred/elapsed:0;
      const left=rate&&pct<100?Math.round((snap.totalBytes-snap.bytesTransferred)/rate):null;
      progressEl.textContent=`업로드 ${pct}% (${sizeText(snap.bytesTransferred)} / ${sizeText(snap.totalBytes)})${left!==null?` · 남은 시간 약 ${left>=60?Math.ceil(left/60)+'분':left+'초'}`:''}`;
    },err=>{uploading--;reject(err)},()=>{uploading--;if(progressEl)progressEl.textContent='업로드 완료';resolve(path)});
  });
}
// 업로드는 됐지만 문서 저장이 실패했을 때 방금 올린 파일을 지웁니다(P1-09). 실패해도 화면 흐름은 막지 않습니다.
export async function removeUploaded(path) {
  if (!path) return;
  try { await deleteObject(storageRef(storage, path)); }
  catch (e) { if (e?.code !== 'storage/object-not-found') console.warn('업로드 파일 정리 실패', path, e); }
}
export async function urlFor(path){try{return path?await getDownloadURL(storageRef(storage,path)):null}catch(e){console.warn('파일을 열 수 없습니다.',e);return null}}
export function useMediaPaths(container){
  if(!container)return;
  $$('[data-media-path]',container).forEach(async el=>{
    const path=el.dataset.mediaPath;
    if(!path)return;
    try{
      // <audio src="Firebase 다운로드 URL">로 바로 재생: getBlob()·CORS 수동 설정 불필요.
      // 다운로드 URL을 가진 사람은 링크를 공유할 수 있으므로 유료/고보안 음성 보호에는 적합하지 않습니다.
      const url=await urlFor(path);
      if(!el.isConnected || !el.closest('body'))return;
      if(!url)throw Error('파일 주소가 없습니다.');
      if(el.tagName==='A'){
        el.href=url;el.target='_blank';el.rel='noopener noreferrer';
      }else{
        el.src=url;
        if(el.tagName==='AUDIO')el.preload='none';
        if(el.tagName==='VIDEO'){el.addEventListener('contextmenu',ev=>ev.preventDefault());el.setAttribute('controlsList','nodownload noremoteplayback');}
      }
    }catch(e){
      console.warn('미디어 주소 확인 실패',path,e);
      if(el.isConnected){
        const message=document.createElement('span');
        message.className='error';message.textContent='파일을 불러오지 못했습니다. 저장 경로 또는 파일 권한을 확인해 주세요.';
        el.replaceWith(message);
      }
    }
  });
}
export function sanitizeRich(html){
  const parsed=new DOMParser().parseFromString(`<div>${html||''}</div>`,'text/html');
  const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','UL','OL','LI','H1','H2','H3','H4','BLOCKQUOTE','SPAN','FONT','A']);
  const styleKeys=new Set(['color','background-color','font-size','font-family','font-weight','text-align','font-style','text-decoration']);
  function safeNode(node){
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const tag=node.tagName; const el=allowed.has(tag)?document.createElement(tag.toLowerCase()):document.createDocumentFragment();
    if(el.nodeType===Node.ELEMENT_NODE){
      if(tag==='A'){const href=node.getAttribute('href')||'';if(/^https?:\/\//i.test(href)){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}}
      if(tag==='FONT'){
        const sz=node.getAttribute('size');if(sz&&/^[1-7]$/.test(sz))el.setAttribute('size',sz);
        const color=node.getAttribute('color');if(color&&/^(#[0-9a-f]{3,8}|[a-z]{3,16}|rgb\([\d\s,%.]+\))$/i.test(color))el.setAttribute('color',color);
        const face=node.getAttribute('face');if(face&&/^[\w가-힣 ,'-]{1,65}$/.test(face))el.setAttribute('face',face);
      }
      const style=node.getAttribute('style');if(style){
        style.split(';').forEach(item=>{const [k,...v]=item.split(':');const key=k?.trim().toLowerCase(), val=v.join(':').trim();if(styleKeys.has(key)&&/^[\w\s#(),.%'-]{1,75}$/.test(val)&&!/(url|expression|behavior|javascript)/i.test(val))el.style.setProperty(key,val)})
      }
    }
    Array.from(node.childNodes).forEach(child=>el.appendChild(safeNode(child)));return el;
  }
  const wrapper=document.createElement('div');Array.from(parsed.body.firstElementChild?.childNodes||[]).forEach(n=>wrapper.appendChild(safeNode(n)));return wrapper.innerHTML;
}
export async function ensureProfile(user){
  const r=doc(db,'users',user.uid),snap=await getDoc(r);
  if(snap.exists()){
    const profile=snap.data();
    // 구버전 가입 경쟁 상태로 기본 이름 '수강생'이 저장된 계정을 복구합니다.
    const authName=(user.displayName||'').trim();
    if(profile.role==='student' && (!profile.displayName || profile.displayName==='수강생') && authName && authName!=='수강생'){
      await updateDoc(r,{displayName:authName,updatedAt:serverTimestamp()});
      return {...profile,displayName:authName};
    }
    return profile;
  }
  const firstName=(user.displayName||'').trim()||'수강생';
  const data={displayName:firstName,realName:firstName,nickname:'',email:user.email||'',role:'student',createdAt:serverTimestamp()};
  await setDoc(r,data);
  return data;
}
export function signedOut(variant='student'){return `<div class="auth-shell"><div class="auth-hero"><div class="brand"><span class="logo"><img src="senorayu-mark-white.svg" alt="쎄뇨라유 스페인어 로고"></span><div><strong>쎄뇨라유 스페인어</strong><small>ESPAÑOL · LEARNING SPACE</small></div></div><div><div class="eyebrow" lang="es">Mi pequeño universo</div>${variant==='admin'?'<h1>오늘의 스페인어가<br>내일의 일상이 되도록.</h1>':'<h1 class="senorayu-opening"><span class="senorayu-opening-intro">오늘의 스페인어가</span><span class="senorayu-opening-main">내일의 일상이</span><span class="senorayu-opening-end">되도록<span class="opening-dot">.</span></span></h1>'}<p>과제를 제출하고, 단어를 복습하고, 다음 수업을 준비하세요. 수업이 끝난 뒤에도 배움은 이어집니다.</p></div><footer>Aprender juntos, crecer juntos. ✨</footer></div><div class="auth-right"><div class="auth-card"><div class="eyebrow" lang="es">¡Hola de nuevo!</div><h2>반갑습니다 👋</h2><p>학습 공간에 로그인해 주세요.</p><div id="setup-note" class="setup-warning ${CONFIGURED?'hide':''}">Firebase 설정이 비어 있습니다. 두 HTML에 동일한 firebaseConfig를 입력해 주세요.</div><form id="login-form" class="stack"><div class="field"><label for="login-email">이메일</label><input id="login-email" name="email" type="email" autocomplete="email" required placeholder="name@example.com"></div><div class="field"><label for="login-password">비밀번호</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호"></div><button class="btn full" type="submit">로그인 →</button></form><div class="auth-links"><button id="auth-alt" class="linkbutton" type="button">회원가입</button><button id="forgot-password" class="linkbutton" type="button">비밀번호 재설정</button></div><div id="login-message" class="error" style="margin-top:15px"></div></div></div></div>`}
export function mountAuth(root,opts={signup:true}){
  root.innerHTML=signedOut(opts.variant); const alt=$('#auth-alt');if(!opts.signup)alt.classList.add('hide');
  let mode='login';alt?.addEventListener('click',()=>{mode=mode==='login'?'signup':'login';const form=$('#login-form');form.innerHTML=mode==='login'?`<div class="field"><label for="auth-email">이메일</label><input id="auth-email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" required autocomplete="current-password"></div><button class="btn full" type="submit">로그인 →</button>`:`<div class="field"><label for="signup-name">이름</label><input id="signup-name" name="name" type="text" required maxlength="35" autocomplete="name" placeholder="강사에게 알린 실제 이름"></div><div class="field"><label for="auth-email">이메일</label><input id="auth-email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="signup-password">비밀번호 (6자 이상)</label><input id="signup-password" name="password" type="password" required minlength="6" autocomplete="new-password"></div><button class="btn full" type="submit">수강생 계정 만들기</button>`;alt.textContent=mode==='login'?'회원가입':'로그인으로 돌아가기';$('#login-message').textContent='';});
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();if(!CONFIGURED){toast('Firebase 설정을 먼저 입력해 주세요.',true);return} const form=e.currentTarget;const data=new FormData(form);const btn=$('button[type="submit"]',form);btn.disabled=true;try{if(mode==='login')await signInWithEmailAndPassword(auth,String(data.get('email')).trim(),String(data.get('password')));else{const cred=await createUserWithEmailAndPassword(auth,String(data.get('email')).trim(),String(data.get('password')));await updateProfile(cred.user,{displayName:String(data.get('name')).trim()});await ensureProfile(cred.user);await updateDoc(doc(db,'users',cred.user.uid),{displayName:String(data.get('name')).trim(),realName:String(data.get('name')).trim(),nickname:'',updatedAt:serverTimestamp()});} }catch(err){$('#login-message').textContent=ex(err)}finally{btn.disabled=false}});
  $('#forgot-password').addEventListener('click',async()=>{if(!CONFIGURED){toast('Firebase 설정이 필요합니다.',true);return}const email=$('input[name="email"]')?.value?.trim();if(!email){toast('먼저 이메일을 입력해 주세요.',true);return}try{await sendPasswordResetEmail(auth,email);toast('비밀번호 재설정 메일을 발송했습니다.')}catch(e){toast(ex(e),true)}});
}
// 녹음은 한 번에 하나만 합니다. 녹음 결과는 '녹음을 시작한 대상'에만 저장되고,
// 화면을 옮기면 자동으로 멈춰 마이크를 끕니다(P0-02). 파일 선택 업로드도 대안으로 제공합니다.
let activeRecorder=null;
export const formatDuration=sec=>{const t=Math.max(0,Math.round(Number(sec)||0));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};
export async function recordStart(onFile,onStatus,label=''){
  if(activeRecorder)throw Error('현재 녹음 중인 항목을 먼저 종료해 주세요.');
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw Error('이 브라우저에서 음성 녹음을 지원하지 않습니다. 음성 파일을 선택해 주세요.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const options=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
  let recorder;try{recorder=options?new MediaRecorder(stream,{mimeType:options}):new MediaRecorder(stream)}catch(err){stream.getTracks().forEach(t=>t.stop());throw err}
  const chunks=[],startedAt=Date.now();
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());
    activeRecorder=null;
    const mime=recorder.mimeType||'audio/webm';
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
    const file=new File(chunks,`recording-${Date.now()}.${ext}`,{type:mime});
    // webm 녹음은 길이 정보가 비어 있는 경우가 있어 시작·종료 시각으로 계산합니다.
    file.durationSec=Math.max(1,Math.round((Date.now()-startedAt)/1000));
    onFile(file);
    onStatus(`녹음 완료 · ${formatDuration(file.durationSec)}`);
  };
  recorder.start();
  activeRecorder={recorder,stream,label};
  onStatus('● 녹음 중입니다. 종료 버튼을 눌러 주세요.');
}
export function recordStop(){if(activeRecorder?.recorder.state==='recording')activeRecorder.recorder.stop()}
export function isRecording(){return !!activeRecorder}
// 화면 전환·로그아웃 때 호출합니다. 녹음 중이면 멈추고 마이크를 끄며, 결과는 녹음을 시작한 대상의 초안으로 보관됩니다.
export function stopRecordingForNavigation(){
  if(!activeRecorder)return false;
  const {recorder,stream,label}=activeRecorder;
  if(recorder.state==='recording')recorder.stop();
  stream.getTracks().forEach(t=>t.stop());
  toast(label?`녹음을 멈췄어요. ${label} 초안에 보관했어요.`:'녹음을 멈췄어요.');
  return true;
}
// ---------- 파일 선택 (배치 12 · P3-05) ----------
// 브라우저 기본 'Choose File / 선택된 파일 없음' 대신 한국어 버튼과 고른 파일 이름을 보여 줍니다.
// input은 화면에서만 숨기고 버튼 모양 label에 연결해, 마우스와 키보드(Tab → Space·Enter) 모두 그대로 동작합니다.
let filePickSeq = 0;
export function filePicker({ id = '', accept = '', label = '파일 선택', attrs = '', showName = true } = {}) {
  const inputId = id || `file-pick-${++filePickSeq}`;
  return `<div class="file-pick"><input type="file" class="file-pick-input" id="${esc(inputId)}"${accept ? ` accept="${esc(accept)}"` : ''}${showName ? ` aria-describedby="${esc(inputId)}-name"` : ''}${attrs ? ' ' + attrs : ''}><label for="${esc(inputId)}" class="btn secondary small file-pick-button">${esc(label)}</label>${showName ? `<span class="file-pick-name" id="${esc(inputId)}-name">선택한 파일 없음</span>` : ''}</div>`;
}
// 고른 파일 이름을 버튼 옆에 보여 줍니다.
export function wireFilePickers(container) {
  for (const input of container.querySelectorAll('.file-pick-input')) {
    const name = container.querySelector(`#${CSS.escape(input.id)}-name`);
    if (!name || input.dataset.pickWired) continue;
    input.dataset.pickWired = '1';
    input.addEventListener('change', () => { name.textContent = input.files?.length ? [...input.files].map(f => f.name).join(', ') : '선택한 파일 없음'; });
  }
}
export function makeMediaUi(kind,label){return `<div class="stack media-ui"><div class="record-controls"><button class="btn soft small" type="button" data-record-start><span aria-hidden="true">●</span> 녹음 시작</button><button class="btn secondary small" type="button" data-record-stop><span aria-hidden="true">■</span> 녹음 종료</button><span class="file-note" data-rec-status role="status"></span></div><div class="field"><span class="field-label">${esc(label||'또는 음성 파일로 올리기')}</span>${filePicker({accept:'audio/*',label:'음성 파일 선택',attrs:'data-audio-input',showName:false})}</div><div class="media-draft hide" data-media-draft><audio controls data-local-audio></audio><div class="media-draft-meta"><span data-media-draft-name></span><button type="button" class="btn ghost small" data-record-clear>첨부 취소</button></div></div><p class="hint">음성 파일은 최대 15MB예요.</p></div>`}
// onFile(file|null): 선택·녹음한 파일을 해당 대상의 초안에 저장(null이면 첨부 취소). initialFile: 보관된 초안 복원
export function wireMediaUi(container,onFile,{label='',initialFile=null}={}){
  const status=$('[data-rec-status]',container),player=$('[data-local-audio]',container),draft=$('[data-media-draft]',container),name=$('[data-media-draft-name]',container),input=$('[data-audio-input]',container);
  const show=(file,prefix)=>{
    if(player.dataset.blob){URL.revokeObjectURL(player.dataset.blob);delete player.dataset.blob}
    if(!file){player.removeAttribute('src');draft.classList.add('hide');return}
    const url=URL.createObjectURL(file);player.dataset.blob=url;player.src=url;
    name.textContent=`${prefix}: ${file.name}${file.durationSec?` · ${formatDuration(file.durationSec)}`:''}`;
    draft.classList.remove('hide');
  };
  const onSelected=async file=>{
    if(!file)return;
    if(file.durationSec===undefined)file.durationSec=await readAudioDuration(file); // P1-06: 파일 선택 업로드도 길이를 남깁니다
    onFile(file);
    if(container.isConnected){show(file,'첨부할 음성');status.textContent=''}
  };
  $('[data-record-start]',container)?.addEventListener('click',async()=>{try{await recordStart(onSelected,t=>{if(status.isConnected)status.textContent=t},label)}catch(e){toast(ex(e),true)}});
  $('[data-record-stop]',container)?.addEventListener('click',recordStop);
  input?.addEventListener('change',e=>onSelected(e.target.files[0]));
  $('[data-record-clear]',container)?.addEventListener('click',()=>{onFile(null);show(null);if(input)input.value='';status.textContent='첨부를 취소했어요.'});
  if(initialFile)show(initialFile,'보관된 음성');
}
// 실시간 갱신 안내 띠(P0-10): 작업 중에는 화면을 다시 그리지 않고 이 띠로 알립니다.
export function showLiveNotice(host,message,actionText,onAction){
  if(!host)return;
  let bar=host.querySelector(':scope > .live-notice');
  if(!bar){bar=document.createElement('div');bar.className='live-notice';bar.setAttribute('role','status');host.prepend(bar)}
  bar.innerHTML=`<span>${esc(message)}</span><button type="button" class="btn small">${esc(actionText)}</button>`;
  bar.querySelector('button').onclick=()=>{bar.remove();onAction()};
}


// ---------- 불러오기 실패 (P1-08) ----------
// '미제출·미입력'과 '불러오지 못함'을 구분해 보여 주고, 그 자리에서 다시 시도하게 합니다.
export function showLoadFailed(el, retry, err) {
  if (!el) return;
  const reason = err ? ex(err) : '';
  el.classList.remove('loading');
  el.innerHTML = `<div class="load-failed" role="alert"><span>기록을 불러오지 못했어요.${reason ? ' ' + esc(reason) : ''}</span>${retry ? '<button type="button" class="btn secondary small" data-retry>다시 시도</button>' : ''}</div>`;
  const button = el.querySelector('[data-retry]');
  if (button) button.onclick = () => retry();
}

// ---------- 작성 중 초안 (P1-07) ----------
// 키에 사용자 uid가 들어가 다른 계정에는 보이지 않습니다. 로그아웃하면 그 사용자의 초안을 지웁니다(공용 PC 보호).
// 사생활 보호 모드 등에서 저장소를 못 쓰면 조용히 건너뜁니다.
const DRAFT_PREFIX = 'senorayu:draft:';
export const draftKey = (...parts) => DRAFT_PREFIX + parts.join(':');
export const drafts = {
  get(key, area = 'local') { try { return (area === 'session' ? sessionStorage : localStorage).getItem(key); } catch (e) { return null; } },
  set(key, value, area = 'local') {
    try { const store = area === 'session' ? sessionStorage : localStorage; if (value) store.setItem(key, value); else store.removeItem(key); }
    catch (e) { console.warn('임시 저장 실패', e); }
  },
  remove(key, area = 'local') { this.set(key, '', area); },
  // 이 사용자의 초안 개수(로그아웃 안내용)
  countFor(uid) { try { return Object.keys(localStorage).filter(k => k.startsWith(DRAFT_PREFIX + uid + ':')).length; } catch (e) { return 0; } },
  clearUser(uid) {
    for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
      try { for (const k of Object.keys(store)) if (k.startsWith(DRAFT_PREFIX + uid + ':')) store.removeItem(k); } catch (e) { /* 저장소 사용 불가 */ }
    }
  },
};

// ---------- 모달 (P0-06) ----------
// 모든 확인·수정은 브라우저 기본 팝업 대신 앱 안의 모달로 처리합니다.
// 열면 첫 입력칸으로 포커스가 가고, Tab은 모달 안에서만 돌며, 닫으면 모달을 연 버튼으로 포커스가 돌아갑니다.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || '');
// 한글 등 조합 중인 Enter는 입력 확정용이므로 저장으로 처리하지 않습니다.
export const isComposingKey = e => e.isComposing || e.keyCode === 229;
// 화면에 모달 층을 띄우고 Escape·포커스 가두기·포커스 복귀를 처리합니다. 반환값 close()로 닫습니다.
// 모달 위에 확인 창을 또 띄우면 위에 쌓이고, 키 입력은 맨 위 모달만 처리합니다.
export function openModalLayer(layer, { onEscape = null } = {}) {
  const opener = document.activeElement;
  document.body.appendChild(layer);
  document.body.classList.add('modal-open');
  const onKey = e => {
    if (e.defaultPrevented || layer !== [...document.querySelectorAll('.app-modal-backdrop')].at(-1)) return;
    if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = [...layer.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !layer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return function close() {
    document.removeEventListener('keydown', onKey);
    layer.remove();
    if (!document.querySelector('.app-modal-backdrop')) document.body.classList.remove('modal-open');
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
  };
}
// value가 null이 아니면 입력칸을 보여 줍니다. multiline이면 여러 줄 입력(Enter = 줄바꿈, Ctrl/⌘+Enter = 저장).
// verify를 주면 그 문구를 정확히 입력해야 확인 버튼이 켜집니다(verifyLabel: 입력칸 이름).
export function modalDialog({
  title = '확인', message = '', value = null, choices = null, placeholder = '', danger = false, confirmText = '확인',
  verify = null, verifyLabel = '확인 문구', multiline = false, allowEmpty = false, maxLength = null, label = '입력',
} = {}) {
  return new Promise(resolve => {
    const limit = maxLength ?? (multiline ? 500 : 1000);
    const saveHint = IS_MAC ? '⌘+Enter로 저장' : 'Ctrl+Enter로 저장';
    const layer = document.createElement('div');
    layer.className = 'app-modal-backdrop';
    const field = choices
      ? `<div class="field"><label for="app-modal-input">선택</label><select id="app-modal-input" class="input app-modal-input">${choices.map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('')}</select></div>`
      : value !== null
        ? `<div class="field"><label for="app-modal-input">${esc(verify ? verifyLabel : label)}</label>${multiline
          ? `<textarea id="app-modal-input" class="input app-modal-input" rows="7" maxlength="${limit}" placeholder="${esc(placeholder)}" aria-describedby="app-modal-hint">${esc(value)}</textarea><p class="hint app-modal-hint" id="app-modal-hint">Enter는 줄바꿈 · ${saveHint}</p>`
          : `<input id="app-modal-input" class="input app-modal-input" maxlength="${limit}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${verify ? 'autocomplete="off"' : ''}>`}</div>`
        : '';
    layer.innerHTML = `<section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title"${message ? ' aria-describedby="app-modal-message"' : ''}><div class="app-modal-head"><div><span class="eyebrow">쎄뇨라유 · 안내</span><h2 id="app-modal-title">${esc(title)}</h2></div><button type="button" class="app-modal-x" aria-label="닫기">×</button></div>${message ? `<p class="app-modal-message" id="app-modal-message">${esc(message)}</p>` : ''}${field}${verify ? `<p class="app-modal-verify">확인을 위해 <strong>${esc(verify)}</strong>을(를) 정확히 입력해 주세요.</p>` : ''}<div class="app-modal-actions"><button type="button" class="btn secondary app-modal-cancel">취소</button><button type="button" class="btn ${danger ? 'danger-solid' : ''} app-modal-ok">${esc(confirmText)}</button></div></section>`;
    let settled = false;
    const close = openModalLayer(layer, { onEscape: () => done(null) });
    const input = layer.querySelector('.app-modal-input'), ok = layer.querySelector('.app-modal-ok');
    function done(v) { if (settled) return; settled = true; close(); resolve(v); }
    if (verify) ok.disabled = true;
    layer.querySelector('.app-modal-cancel').onclick = () => done(null);
    layer.querySelector('.app-modal-x').onclick = () => done(null);
    layer.onclick = e => { if (e.target === layer) done(null); };
    input?.addEventListener('input', () => { if (verify) ok.disabled = input.value.trim() !== verify; });
    input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || isComposingKey(e)) return;
      if (input.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return; // 여러 줄 입력: Enter는 줄바꿈
      e.preventDefault();
      if (!ok.disabled) ok.click();
    });
    ok.onclick = () => {
      if (input && value !== null && !verify && !allowEmpty && !input.value.trim()) { input.focus(); return; }
      done(input ? input.value : true);
    };
    requestAnimationFrame(() => { (input || ok).focus(); if (input && value !== null && !verify && !multiline) input.select(); });
  });
}
// 선택지가 셋 이상인 확인 창. 고른 value를, 닫거나 Escape를 누르면 null을 돌려줍니다.
// choices: [{value, label, kind:'primary'|'secondary'|'danger'}]
export function modalChoice({ title = '확인해 주세요', message = '', choices = [] } = {}) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'app-modal-backdrop';
    layer.innerHTML = `<section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title" aria-describedby="app-modal-message"><div class="app-modal-head"><div><span class="eyebrow">쎄뇨라유 · 안내</span><h2 id="app-modal-title">${esc(title)}</h2></div><button type="button" class="app-modal-x" aria-label="닫기">×</button></div><p class="app-modal-message" id="app-modal-message">${esc(message)}</p><div class="app-modal-actions">${choices.map((c, i) => `<button type="button" class="btn ${c.kind === 'danger' ? 'danger-solid' : c.kind === 'secondary' ? 'secondary' : ''}" data-choice="${i}">${esc(c.label)}</button>`).join('')}</div></section>`;
    let settled = false;
    const close = openModalLayer(layer, { onEscape: () => done(null) });
    function done(v) { if (settled) return; settled = true; close(); resolve(v); }
    layer.querySelector('.app-modal-x').onclick = () => done(null);
    layer.onclick = e => { if (e.target === layer) done(null); };
    layer.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => done(choices[Number(b.dataset.choice)].value));
    requestAnimationFrame(() => layer.querySelector('[data-choice]')?.focus());
  });
}
// 인터넷이 끊기면 화면 위에 띠로 알립니다(P1-08 선택 항목).
export function installOfflineBanner() {
  const show = () => {
    if (document.querySelector('.offline-banner')) return;
    const bar = document.createElement('div');
    bar.className = 'offline-banner'; bar.setAttribute('role', 'status');
    bar.textContent = '인터넷 연결이 끊겼어요. 연결되면 자동으로 다시 이어집니다.';
    document.body.appendChild(bar);
  };
  window.addEventListener('offline', show);
  window.addEventListener('online', () => document.querySelector('.offline-banner')?.remove());
  if (navigator.onLine === false) show();
}
// 확인 창: 동작마다 알맞은 제목과 버튼 문구를 붙입니다.
export async function modalConfirm(message, { title = '확인해 주세요', confirmText = '진행하기', danger = false } = {}) {
  return !!(await modalDialog({ title, message, confirmText, danger }));
}
export async function modalInput(message, value = '', { title = '정보 수정', confirmText = '저장하기', label = '입력', maxLength = null } = {}) {
  return await modalDialog({ title, message, value, confirmText, label, maxLength });
}
