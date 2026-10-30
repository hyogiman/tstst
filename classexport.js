// 반 내보내기(2026-10-30): 한 반의 과제·평가(복습 결과·피드백)·출석 기록을 CSV로 만들고, 학생 과제 음성·피드백 음성과 함께 ZIP 하나로 묶습니다.
// 영상·예습 자료는 강사가 원본을 갖고 있어 넣지 않습니다.
// Firebase를 불러오지 않는 순수 모듈입니다(dashboard.js와 같은 이유: common.js를 다른 ?v= 주소로 불러오면 Firebase가 두 번 초기화됨).
// 기록 읽기·파일 내려받기는 admin.html이 맡고, 날짜·판정 함수는 deps로 받습니다.
// 압축 파일 안의 이름은 영문·숫자만 씁니다. 운영체제 기본 압축 풀기에서 한글 파일 이름이 깨지는 경우를 피하려는 것이고, 한글 설명은 README.txt에 있습니다.

const BOM = '﻿';
const pad2 = n => String(n).padStart(2, '0');

// ---------- CSV ----------
// 학생이 쓴 글이 =, +, -, @로 시작하면 엑셀이 수식으로 읽지 않게 맨 앞에 '를 붙입니다(CSV 수식 주입 방지).
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// 엑셀에서 두 번 눌러 열어도 한글이 깨지지 않게 UTF-8 BOM과 CRLF 줄바꿈을 씁니다.
export function toCsv(rows) { return BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

// ---------- ZIP ----------
let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
// 브라우저 내장 압축(CompressionStream 'deflate-raw'). 지원하지 않는 브라우저면 null을 돌려주고 압축 없이 담습니다.
async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) { return null; }
}
// entries: [{name, data: string | Uint8Array, compress}] → ZIP Blob. 글은 압축하고, 이미 압축된 음성은 그대로 담습니다.
// ZIP64는 쓰지 않으므로 전체 4GB · 파일 65,535개까지입니다(한 반의 기록과 음성은 이보다 훨씬 작음).
export async function makeZip(entries, when = new Date()) {
  const enc = new TextEncoder(), parts = [], central = [];
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(raw), packed = e.compress ? await deflateRaw(raw) : null;
    const deflated = !!packed && packed.length < raw.length, body = deflated ? packed : raw;
    // 지역 머리글(30바이트) + 이름 + 내용
    const lv = new DataView(new ArrayBuffer(30));
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, deflated ? 8 : 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    parts.push(lv.buffer, name, body);
    const cv = new DataView(new ArrayBuffer(46));
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, deflated ? 8 : 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.push(cv.buffer, name);
    offset += 30 + name.length + body.length;
    if (offset > 0xFFFFFFFF) throw Error('내보낼 파일이 4GB를 넘습니다. 음성 파일을 빼고 다시 내보내 주세요.');
  }
  if (entries.length > 0xFFFF) throw Error('파일이 너무 많아 하나로 묶을 수 없습니다.');
  const size = central.reduce((n, p) => n + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// ---------- 내보낼 내용 ----------
const STATUS = { active: '수강 중', inactive: '수강 중지', transferred: '반 이동' };
const EVENT = { joined: '입장', stopped: '수강 중지', resumed: '다시 수강', transferred_out: '다른 반으로 이동', transferred_in: '이 반으로 이동' };
const TYPE = { single: '객관식', multiple: '복수정답', ox: 'O/X' };
const REVIEW = { pending: '확인 전', rereview: '재검토 대기', done: '피드백 완료' };
const extOf = path => (String(path || '').match(/\.([A-Za-z0-9]{1,5})$/)?.[1] || 'webm').toLowerCase();

/**
 * input = {
 *   cls: {id, name, schedule}, exportedAt: Date,
 *   weeks: 정렬 번호 순 [{id, label, sessionDate, published, assignment, quiz}],
 *   students: [{uid, name, email, status, joinedAt, events[], note, goal}],   // 반 명단(강사 화면 이름 기준)
 *   submissions: {wid: {uid: {...제출 요약, revisions: [회차 문서]}}}, quizResults: {wid: {uid}}, attendance: {wid: {uid}},
 * }
 * 학생 번호(s01…)와 차시 번호(w01…)는 CSV와 음성 파일 이름이 함께 씁니다.
 * audio: 내려받을 음성 [{storagePath, zipPath}](같은 파일을 여러 회차가 쓰면 한 번만)
 */
export function exportPlan(input) {
  const students = [...input.students].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  // 반 명단에는 없는데 기록만 남은 학생(수강 등록이 지워진 경우)도 넣습니다.
  const known = new Set(students.map(s => s.uid));
  for (const w of input.weeks) for (const kind of ['submissions', 'quizResults', 'attendance'])
    for (const [uid, d] of Object.entries(input[kind]?.[w.id] || {}))
      if (!known.has(uid)) { known.add(uid); students.push({ uid, name: d.studentName || '이름 없음', email: d.email || '', status: '', joinedAt: null, events: [], noEnrollment: true }); }
  const num = new Map(students.map((s, i) => [s.uid, 's' + pad2(i + 1)]));
  const wnum = new Map(input.weeks.map((w, i) => [w.id, 'w' + pad2(i + 1)]));
  const audio = [], byPath = new Map();
  const add = (storagePath, zipPath) => {
    if (!storagePath) return;
    if (!byPath.has(storagePath)) { byPath.set(storagePath, zipPath); audio.push({ storagePath, zipPath }); }
  };
  for (const w of input.weeks) {
    for (const [uid, d] of Object.entries(input.submissions?.[w.id] || {})) {
      const base = `${wnum.get(w.id)}_${num.get(uid)}`;
      for (const r of [...(d.revisions || [])].sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0)))
        add(r.audioPath, `audio/assignment/${base}_r${Number(r.revision) || 1}.${extOf(r.audioPath)}`);
      add(d.audioPath, `audio/assignment/${base}_r${Number(d.revision) || 1}.${extOf(d.audioPath)}`);
      (d.feedbacks || []).forEach((f, k) => add(f?.audioPath, `audio/feedback/${base}_assignment_${k + 1}.${extOf(f?.audioPath)}`));
    }
    for (const [uid, d] of Object.entries(input.quizResults?.[w.id] || {}))
      (d.feedbacks || []).forEach((f, k) => add(f?.audioPath, `audio/feedback/${wnum.get(w.id)}_${num.get(uid)}_quiz_${k + 1}.${extOf(f?.audioPath)}`));
  }
  return { students, num, wnum, audio, zipPathOf: p => byPath.get(p) || '' };
}

/**
 * deps: formatDateTime, toDate, todayKey, attendanceValue, wasActiveAt, reviewState, feedbackItems, normalizeQuizQuestion
 * missing: 내려받지 못한 음성의 Storage 경로 Set · audioIncluded: 음성을 담았는지
 * 돌려주는 값: [{name, data}] (README.txt와 CSV 파일들)
 */
export function exportFiles(input, plan, deps, { missing = new Set(), audioIncluded = true } = {}) {
  const { students, num, wnum } = plan;
  const day = v => deps.formatDateTime(v, { time: false, weekday: false, year: 'always', empty: '' });
  const at = v => deps.formatDateTime(v, { weekday: false, year: 'always', empty: '' });
  const today = deps.todayKey(input.exportedAt);
  const audioCell = path => !path ? '' : !audioIncluded ? '(음성 제외하고 내보냄)' : missing.has(path) ? `${plan.zipPathOf(path)} (내려받지 못함)` : plan.zipPathOf(path);
  const pct = (score, total) => Number(total) > 0 ? Math.round(100 * (Number(score) || 0) / Number(total)) + '%' : '';
  const active = (s, w) => !w.sessionDate ? true : s.noEnrollment ? false : deps.wasActiveAt({ status: s.status, joinedAt: s.joinedAt }, s.events || [], w.sessionDate).active;
  const feedbackText = d => deps.feedbackItems(d).map(f => `[${f.forRevision ? f.forRevision + '차 제출 · ' : ''}${at(f.createdAt)}] ${f.text || '(음성 피드백)'}`).join('\n');
  const feedbackAudio = d => deps.feedbackItems(d).map(f => audioCell(f.audioPath)).filter(Boolean).join('\n');
  const head = s => [num.get(s.uid), s.name];

  const studentsCsv = [['번호', '이름', '이메일', '수강 상태', '등록일', '수강 기간 기록', '강사 메모', '다음 학습 목표'],
    ...students.map(s => [...head(s), s.email || '', s.noEnrollment ? '수강 등록 없음(기록만 남음)' : STATUS[s.status] || s.status || '', day(s.joinedAt),
      [...(s.events || [])].sort((a, b) => (deps.toDate(a.at)?.getTime() || 0) - (deps.toDate(b.at)?.getTime() || 0)).map(e => `${EVENT[e.type] || e.type} ${day(e.at)}`).join(' · '),
      s.note || '', s.goal || ''])];

  const sessionsCsv = [['차시 번호', '차시', '수업 날짜', '학생에게 공개', '과제', '과제 제목', '제출 권장일', '복습 퀴즈', '복습 제목', '문항 수'],
    ...input.weeks.map(w => [wnum.get(w.id), w.label, w.sessionDate || '', w.published ? '공개' : '비공개',
      w.assignment?.enabled ? '켜짐' : '꺼짐', w.assignment?.title || '', String(w.assignment?.dueAt || '').replace('T', ' '),
      w.quiz?.enabled ? '켜짐' : '꺼짐', w.quiz?.title || '', (w.quiz?.questions || []).length || ''])];

  // 출석표: 미입력은 수업 날짜가 지난(오늘 포함) 차시에서 그때 수강 중이던 학생만 셉니다.
  const attendanceCsv = [['번호', '이름', ...input.weeks.map(w => w.label), '출석', '불참', '미입력'],
    ...students.map(s => {
      const count = { present: 0, absent: 0, none: 0 };
      const cells = input.weeks.map(w => {
        const d = input.attendance?.[w.id]?.[s.uid], v = deps.attendanceValue(d?.status);
        if (v) { count[v]++; return (v === 'present' ? '출석' : '불참') + (d.note ? ` (${d.note})` : ''); }
        if (!w.sessionDate || w.sessionDate > today) return '';
        if (!active(s, w)) return '수강 기간 밖';
        count.none++; return '미입력';
      });
      return [...head(s), ...cells, count.present, count.absent, count.none];
    })];

  const assignmentRows = [], historyRows = [];
  for (const w of input.weeks) {
    const subs = input.submissions?.[w.id] || {};
    if (!w.assignment?.enabled && !Object.keys(subs).length) continue;
    for (const s of students) {
      const d = subs[s.uid];
      if (!d) { assignmentRows.push([wnum.get(w.id), w.label, w.assignment?.title || '', ...head(s), w.sessionDate && w.sessionDate <= today && !active(s, w) ? '수강 기간 밖' : '미제출', '', '', '', '', '', '', '', '']); continue; }
      assignmentRows.push([wnum.get(w.id), w.label, w.assignment?.title || '', ...head(s), REVIEW[deps.reviewState(d)] || '',
        Number(d.revision) || 1, at(d.firstSubmittedAt || d.submittedAt), at(d.latestSubmittedAt || d.submittedAt),
        d.text || '', audioCell(d.audioPath), Number(d.audioDuration) || '', feedbackText(d), feedbackAudio(d)]);
      const revisions = (d.revisions || []).length ? [...d.revisions].sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0)) : [{ ...d, revision: Number(d.revision) || 1 }];
      for (const r of revisions) historyRows.push([wnum.get(w.id), w.label, ...head(s), Number(r.revision) || 1, at(r.submittedAt), r.text || '', audioCell(r.audioPath), Number(r.audioDuration) || '']);
    }
  }
  const assignmentsCsv = [['차시 번호', '차시', '과제 제목', '번호', '이름', '상태', '제출 회차', '처음 제출', '마지막 제출', '답안', '음성 파일', '음성 길이(초)', '피드백', '피드백 음성'], ...assignmentRows];
  const historyCsv = [['차시 번호', '차시', '번호', '이름', '회차', '제출 시각', '답안', '음성 파일', '음성 길이(초)'], ...historyRows];

  const quizRows = [], questionRows = [];
  for (const w of input.weeks) {
    const results = input.quizResults?.[w.id] || {}, questions = w.quiz?.questions || [];
    if (!(w.quiz?.enabled && questions.length) && !Object.keys(results).length) continue;
    for (const s of students) {
      const d = results[s.uid];
      if (!d) { quizRows.push([wnum.get(w.id), w.label, w.quiz?.title || '', ...head(s), w.sessionDate && w.sessionDate <= today && !active(s, w) ? '수강 기간 밖' : '미응시', '', '', '', '', '', '', '', '', '']); continue; }
      const fa = d.firstAttempt, known = fa && !fa.legacy;
      quizRows.push([wnum.get(w.id), w.label, w.quiz?.title || '', ...head(s), '응시',
        known ? `${Number(fa.score) || 0}/${Number(fa.total) || 0}` : '알 수 없음(이전 기록)', known ? pct(fa.score, fa.total) : '', known ? at(fa.submittedAt) : '',
        `${Number(d.score) || 0}/${Number(d.total) || 0}`, pct(d.score, d.total), at(d.submittedAt),
        Number(d.attemptCount) || 1, feedbackText(d), feedbackAudio(d)]);
    }
    questions.map((q, i) => deps.normalizeQuizQuestion(q, i)).forEach((q, i) => questionRows.push([
      wnum.get(w.id), w.label, Number(w.quiz?.version) || '', i + 1, TYPE[q.type] || q.type, q.stem,
      q.options.map((o, k) => `${k + 1}) ${o}`).join('\n'), q.correctIndices.map(k => `${k + 1}) ${q.options[k] ?? ''}`).join(', '), q.explanation || '']));
  }
  const quizCsv = [['차시 번호', '차시', '복습 제목', '번호', '이름', '상태', '첫 응시 점수', '첫 응시 정답률', '첫 응시 시각', '최근 점수', '최근 정답률', '최근 응시 시각', '응시 횟수', '피드백', '피드백 음성'], ...quizRows];
  const questionsCsv = [['차시 번호', '차시', '문제 버전', '문항', '유형', '문제', '보기', '정답', '해설'], ...questionRows];

  const missingList = plan.audio.filter(a => missing.has(a.storagePath));
  const readme = [
    '쎄뇨라유 스페인어 · 반 기록 내보내기',
    `반: ${input.cls.name || ''}`,
    `내보낸 시각: ${at(input.exportedAt)}`,
    `학생 ${students.length}명 · 차시 ${input.weeks.length}개 · 음성 파일 ${audioIncluded ? `${plan.audio.length - missingList.length}개` : '넣지 않음'}${missingList.length ? ` (내려받지 못한 파일 ${missingList.length}개, 맨 아래 참고)` : ''}`,
    '',
    '[파일 안내]',
    'students.csv            학생 명단: 번호·이름·이메일·수강 상태·등록일·수강 기간 기록·강사 메모·다음 학습 목표',
    'sessions.csv            차시 목록: 수업 날짜·공개 여부·과제와 복습 퀴즈 정보',
    'attendance.csv          출석표(학생 × 차시). 미입력은 수업 날짜가 지난 차시에서 그때 수강 중이던 학생만 셉니다',
    'assignments.csv         과제(차시 × 학생): 상태·최신 답안·음성 파일·선생님 피드백',
    'assignment-history.csv  과제 제출 이력: 다시 낸 회차까지 모두',
    'quiz-results.csv        복습 퀴즈 결과: 첫 응시 점수·최근 점수·응시 횟수·피드백',
    'quiz-questions.csv      복습 퀴즈 문항과 정답(내보낼 때의 문제)',
    'audio/assignment/       학생 과제 음성. 예) w01_s03_r2 = 1번째 차시 · 학생 s03 · 2차 제출',
    'audio/feedback/         선생님 피드백 음성. 예) w01_s03_assignment_1 = 1번째 차시 · 학생 s03 · 과제 피드백 1',
    '',
    '[엑셀에서 열기]',
    'CSV 파일은 UTF-8(BOM)로 저장했습니다. 엑셀에서 두 번 눌러 열면 한글이 그대로 보입니다.',
    "학생 글이 =, +, -, @로 시작하면 엑셀이 수식으로 읽지 않도록 맨 앞에 '를 붙였습니다.",
    '번호(s01…)와 차시 번호(w01…)는 이 내보내기 안에서만 쓰는 번호입니다.',
    '',
    '[넣지 않은 것]',
    '강의 영상·수업 영상·예습 자료(선생님 원본), 질문함 대화, 공지사항',
    ...(missingList.length ? ['', '[내려받지 못한 음성 파일]',
      '브라우저가 Storage에서 파일을 내려받지 못했습니다. 대부분 Storage의 CORS 설정이 없을 때 생깁니다(저장소 README의 반 내보내기 안내 참고).',
      ...missingList.map(a => `${a.zipPath}  ←  ${a.storagePath}`)] : []),
  ].join('\r\n') + '\r\n';

  return [
    { name: 'README.txt', data: BOM + readme },
    { name: 'students.csv', data: toCsv(studentsCsv) },
    { name: 'sessions.csv', data: toCsv(sessionsCsv) },
    { name: 'attendance.csv', data: toCsv(attendanceCsv) },
    { name: 'assignments.csv', data: toCsv(assignmentsCsv) },
    { name: 'assignment-history.csv', data: toCsv(historyCsv) },
    { name: 'quiz-results.csv', data: toCsv(quizCsv) },
    { name: 'quiz-questions.csv', data: toCsv(questionsCsv) },
  ];
}

// 내려받을 파일 이름: 반 이름 + 날짜. 운영체제에서 쓸 수 없는 글자는 _로 바꿉니다.
export function exportFileName(className, dateKey) {
  return `${String(className || '반').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || '반'} 기록 ${dateKey}.zip`;
}
