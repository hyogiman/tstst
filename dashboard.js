// 강사 대시보드 집계 (배치 09 · P2-01~04, D2 · D3 · D5)
// 화면 그리기와 분리한 순수 함수라 하네스에서 가상 데이터로 단위 테스트합니다(tests/run.cjs의 DB 테스트).
// 이 파일은 Firebase를 불러오지 않습니다. 판정 함수(sessionState·wasActiveAt 등)는 common.js의 것을 deps로 받습니다.
// (이 파일이 common.js를 다른 ?v= 주소로 불러오면 모듈이 두 번 실행되어 Firebase가 두 번 초기화되기 때문입니다.)
//
// 기준 정의 (docs/prompts/09-dashboard.md 3-2)
// - 완료 차시: sessionState(...) === 'done'. 오늘 차시는 수업이 끝나기 전이라 통계와 '출결 미입력'에서 뺍니다.
// - 차시 대상자: 그 차시 날짜에 수강 중이던 학생(wasActiveAt). 근거가 부족하면 '추정'으로 표시합니다.
// - 출석률(D2): 출석 ÷ (출석 + 불참). 미입력은 빼고, 입력률을 따로 셉니다.
// - 과제 제출률(D3): 공개된 과제 × 대상자 중 지금까지 제출한 비율. 제출 권장일과 상관없이 늦은 제출도 제출입니다.
// - 복습 참여율: 공개된 복습 × 대상자 중 응시한 비율.
// - 첫 응시 정답률: 실제 첫 응시만 평균합니다. 첫 응시를 알 수 없는 이전 기록은 빼고 건수를 셉니다.
// - 미제출·미응시는 0점으로 계산하지 않습니다. 참여(비율)와 성취(정답률)를 따로 보여 줍니다.
// - 공개 누락: 3일 안에 수업인데, 만들어 둔 예습(글·이미지·영상·첨부)이 학생에게 안 보이는 차시(차시 비공개 또는 예습 꺼짐).
//   예습을 쓰지 않는 차시는 세지 않습니다(2026-10-29 결정).

export const TREND_SESSIONS = 8;     // 차시별 추이: 최근 완료 8차시
export const GRID_SESSIONS = 6;      // 학생 × 차시 진행표: 최근 완료 6차시
export const PUBLISH_SOON_DAYS = 3;  // 공개 누락: 오늘부터 3일 안에 수업인 차시만 봅니다
// '챙겨 볼 학생' 규칙. 설명할 수 있는 규칙만 쓰고, 점수·순위로 바꾸지 않습니다.
export const WATCH_RULES = {
  absenceWindow: 3, absenceMin: 2, // 최근 완료 3차시 중 불참 2회 이상
  missedAssignments: 2,            // 공개된 과제 2회 연속 미제출
  missedQuizzes: 2,                // 공개된 복습 최근 2회 연속 미응시
};

// '1차시 · 인사와 자기소개' → '1차시'
export const shortLabel = label => String(label || '').split(' · ')[0].trim() || '차시';
// ['3차시','4차시'] → '3·4차시' (번호 형식이 아니면 '·'로 잇기만 합니다)
export function joinSessionLabels(labels) {
  const nums = labels.map(l => /^(\d+)차시$/.exec(l));
  return nums.every(Boolean) ? nums.map(m => m[1]).join('·') + '차시' : labels.join('·');
}
export const ratio = (num, den) => (den > 0 ? num / den : null);

// 피드백 대기·재검토 대기 수. 대시보드 '처리할 일'과 강사 사이드바 배지(배치 10)가 같은 기준을 씁니다.
// 지금 수강 중인 학생의 제출만 셉니다(과제·복습 관리 화면에 보이는 학생과 같게).
export function feedbackQueue(submissions, activeUids, reviewState) {
  let pending = 0, rereview = 0;
  for (const d of submissions || []) {
    if (!d || !activeUids.has(d.id)) continue;
    const state = reviewState(d);
    if (state === 'pending') pending++;
    else if (state === 'rereview') rereview++;
  }
  return { pending, rereview };
}

// 예습을 실제로 만들어 두었는지: 글(텍스트 모드)·안내 이미지(이미지 모드)·영상·첨부 중 하나라도 있으면 true.
// 제목만 있거나 편집기에 빈 줄만 남은 예습은 만든 것으로 보지 않습니다.
// 강사가 꺼 둔 영상·첨부 묶음(videosEnabled·filesEnabled가 false)은 예습을 공개해도 보이지 않으므로 세지 않습니다.
export function previewPrepared(preview) {
  if (!preview) return false;
  const shown = (on, list) => on !== false && (list || []).length > 0;
  if (shown(preview.videosEnabled, preview.videos) || shown(preview.filesEnabled, preview.files)) return true;
  if (preview.mode === 'image') return !!preview.imagePath;
  return String(preview.richHtml || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim() !== '';
}

// 첫 응시 기록 판정: {kind:'first', pct} · {kind:'legacy'}(첫 응시를 알 수 없는 이전 기록)
export function firstAttemptOf(result) {
  const fa = result?.firstAttempt;
  if (!fa || fa.legacy === true) return { kind: 'legacy' };
  const score = Number(fa.score), total = Number(fa.total);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return { kind: 'legacy' };
  return { kind: 'first', pct: Math.max(0, Math.min(100, 100 * score / total)) };
}

/**
 * input = {
 *   sessions: 정렬 번호 순 차시 [{id, label, order, date('YYYY-MM-DD'|''), published, assignment:{enabled}, quiz:{enabled, questions}, preview:{enabled, mode, richHtml, imagePath, videos, files, videosEnabled, filesEnabled}}]
 *   enrollments: 이 반의 수강 등록 [{id, uid, status, joinedAt, studentName}]
 *   events: {등록ID: [수강 기간 기록]} · 읽지 못했으면 null(등록일 기준 추정)
 *   names: {uid: 표시 이름}
 *   attendance / submissions / quizResults: {차시ID: [{id: uid, ...}]}
 *   questions: 이 반의 질문 목록
 * }
 * today: 'YYYY-MM-DD'(운영 시간대) · deps: {sessionState, wasActiveAt, reviewState, needsReply, attendanceValue, daysBetween}
 */
export function computeDashboard(input, today, deps) {
  const { sessionState, wasActiveAt, reviewState, needsReply, attendanceValue, daysBetween } = deps;
  const enrollments = (input.enrollments || []).filter(e => e && e.uid);
  const activeNow = new Set(enrollments.filter(e => e.status === 'active').map(e => e.uid));
  const eventsOf = e => (input.events && input.events[e.id]) || [];
  const nameOf = uid => input.names?.[uid] || enrollments.find(e => e.uid === uid)?.studentName || '이름 미등록';
  const docsBy = (group, sid) => new Map((group?.[sid] || []).map(d => [d.id, d]));

  const sessions = (input.sessions || []).map(s => {
    const att = docsBy(input.attendance, s.id), sub = docsBy(input.submissions, s.id), quiz = docsBy(input.quizResults, s.id);
    const date = s.date || '';
    const state = sessionState({ date }, today, { hasAttendance: att.size > 0 });
    const hasAssignment = !!(s.published && s.assignment?.enabled);
    const hasQuiz = !!(s.published && s.quiz?.enabled && (s.quiz.questions || []).length);
    const row = {
      id: s.id, label: s.label || '차시', short: shortLabel(s.label), date, state, published: !!s.published,
      hasAssignment, hasQuiz, previewOn: !!s.preview?.enabled, previewReady: previewPrepared(s.preview),
      targets: 0, estimated: false,
      attendance: { present: 0, absent: 0, missing: 0 },
      assignment: hasAssignment ? { submitted: 0, targets: 0 } : null,
      quiz: hasQuiz ? { attempted: 0, targets: 0, firstN: 0, firstSum: 0, legacy: 0 } : null,
      cells: new Map(),
    };
    for (const e of enrollments) {
      const span = wasActiveAt(e, eventsOf(e), date);
      const a = attendanceValue(att.get(e.uid)?.status);
      const submitted = sub.has(e.uid), result = quiz.get(e.uid);
      const first = result ? firstAttemptOf(result) : null;
      const cell = {
        target: span.active, estimated: span.active && span.estimated,
        attendance: span.active ? (a || 'missing') : (a || null),
        assignment: hasAssignment ? (submitted ? 'submitted' : span.active ? 'missing' : null) : (span.active ? 'none' : null),
        quiz: hasQuiz ? (first || (span.active ? 'missing' : null)) : (span.active ? 'none' : null),
      };
      cell.outside = !span.active && !!(cell.attendance || cell.assignment || cell.quiz); // 수강 기간 밖의 기록
      row.cells.set(e.uid, cell);
      if (!span.active) continue;
      row.targets++;
      if (span.estimated) row.estimated = true;
      row.attendance[a || 'missing']++;
      if (row.assignment) { row.assignment.targets++; if (submitted) row.assignment.submitted++; }
      if (row.quiz) {
        row.quiz.targets++;
        if (first) {
          row.quiz.attempted++;
          if (first.kind === 'first') { row.quiz.firstN++; row.quiz.firstSum += first.pct; } else row.quiz.legacy++;
        }
      }
    }
    return row;
  });

  const done = sessions.filter(s => s.state === 'done');
  const sum = (list, pick) => list.reduce((n, s) => n + (pick(s) || 0), 0);
  const latest = (pred) => [...sessions].reverse().find(s => (s.state === 'done' || s.state === 'today') && pred(s)) || null;

  // ----- 핵심 지표 (완료 차시 전체) -----
  const present = sum(done, s => s.attendance.present), absent = sum(done, s => s.attendance.absent), expected = sum(done, s => s.targets);
  const withAssignment = done.filter(s => s.assignment), withQuiz = done.filter(s => s.quiz);
  const currentAssignment = latest(s => s.hasAssignment), currentQuiz = latest(s => s.hasQuiz);
  const firstN = sum(withQuiz, s => s.quiz.firstN), firstSum = sum(withQuiz, s => s.quiz.firstSum);
  const kpi = {
    activeStudents: activeNow.size,
    doneSessions: done.length,
    attendance: { present, absent, recorded: present + absent, expected, rate: ratio(present, present + absent), inputRate: ratio(present + absent, expected) },
    assignment: {
      sessions: withAssignment.length,
      submitted: sum(withAssignment, s => s.assignment.submitted), expected: sum(withAssignment, s => s.assignment.targets),
      current: currentAssignment && { id: currentAssignment.id, short: currentAssignment.short, state: currentAssignment.state, ...currentAssignment.assignment },
    },
    quiz: {
      sessions: withQuiz.length,
      firstN, average: firstN ? firstSum / firstN : null, legacy: sum(withQuiz, s => s.quiz.legacy),
      attempted: sum(withQuiz, s => s.quiz.attempted), expected: sum(withQuiz, s => s.quiz.targets),
      current: currentQuiz && { id: currentQuiz.id, short: currentQuiz.short, state: currentQuiz.state, attempted: currentQuiz.quiz.attempted, targets: currentQuiz.quiz.targets },
    },
  };
  kpi.assignment.rate = ratio(kpi.assignment.submitted, kpi.assignment.expected);
  kpi.quiz.participation = ratio(kpi.quiz.attempted, kpi.quiz.expected);

  // ----- 처리할 일 -----
  // 과제·출결 카드는 지금 수강 중인 학생만 셉니다(눌렀을 때 열리는 과제·출석 화면에 보이는 학생과 같게).
  const bySession = (list, count) => {
    const rows = list.map(s => ({ id: s.id, short: s.short, label: s.label, date: s.date, count: count(s) })).filter(r => r.count > 0);
    return { total: rows.reduce((n, r) => n + r.count, 0), sessions: rows };
  };
  const reviewCount = wanted => s => feedbackQueue(input.submissions?.[s.id], activeNow, reviewState)[wanted];
  const publishSoon = sessions.filter(s => s.state !== 'done' && s.date && daysBetween(today, s.date) >= 0 && daysBetween(today, s.date) <= PUBLISH_SOON_DAYS && s.previewReady && (!s.published || !s.previewOn));
  const actions = {
    feedback: bySession(sessions, reviewCount('pending')),
    rereview: bySession(sessions, reviewCount('rereview')),
    questions: { total: (input.questions || []).filter(needsReply).length },
    attendance: bySession(done, s => [...s.cells].filter(([uid, c]) => c.target && activeNow.has(uid) && c.attendance === 'missing').length),
    publish: {
      total: publishSoon.length,
      sessions: publishSoon.map(s => ({ id: s.id, short: s.short, label: s.label, date: s.date, count: 1, reason: !s.published ? '비공개' : '예습 꺼짐' })),
    },
  };
  actions.total = actions.feedback.total + actions.rereview.total + actions.questions.total + actions.attendance.total + actions.publish.total;

  // ----- 학생 × 차시 진행표 -----
  const gridSessions = done.slice(-GRID_SESSIONS);
  const people = enrollments.filter(e => activeNow.has(e.uid) || gridSessions.some(s => s.cells.get(e.uid)?.target));
  const grid = {
    sessions: gridSessions.map(s => ({ id: s.id, short: s.short, label: s.label, date: s.date, hasAssignment: s.hasAssignment, hasQuiz: s.hasQuiz })),
    rows: people.map(e => ({ uid: e.uid, name: nameOf(e.uid), status: e.status, cells: gridSessions.map(s => s.cells.get(e.uid)) }))
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name, 'ko')),
  };

  // ----- 챙겨 볼 학생 (지금 수강 중인 학생, 그 학생이 대상이었던 완료 차시 기준) -----
  const watch = [];
  for (const e of enrollments.filter(x => activeNow.has(x.uid))) {
    const mine = done.filter(s => s.cells.get(e.uid)?.target);
    const reasons = [];
    const recent = mine.slice(-WATCH_RULES.absenceWindow), absentIn = recent.filter(s => s.cells.get(e.uid).attendance === 'absent');
    if (recent.length >= WATCH_RULES.absenceMin && absentIn.length >= WATCH_RULES.absenceMin)
      reasons.push({ rule: 'absence', text: `${joinSessionLabels(absentIn.map(s => s.short))} 불참` });
    const lastAssignments = mine.filter(s => s.assignment).slice(-WATCH_RULES.missedAssignments);
    if (lastAssignments.length === WATCH_RULES.missedAssignments && lastAssignments.every(s => s.cells.get(e.uid).assignment === 'missing'))
      reasons.push({ rule: 'assignment', text: `${joinSessionLabels(lastAssignments.map(s => s.short))} 과제 미제출` });
    const lastQuizzes = mine.filter(s => s.quiz).slice(-WATCH_RULES.missedQuizzes);
    if (lastQuizzes.length === WATCH_RULES.missedQuizzes && lastQuizzes.every(s => s.cells.get(e.uid).quiz === 'missing'))
      reasons.push({ rule: 'quiz', text: `${joinSessionLabels(lastQuizzes.map(s => s.short))} 복습 미응시` });
    if (reasons.length) watch.push({ uid: e.uid, name: nameOf(e.uid), reasons });
  }
  watch.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name, 'ko'));

  return {
    today, sessions, done: done.map(s => s.id), recent: done.slice(-TREND_SESSIONS).map(s => s.id),
    estimated: done.some(s => s.estimated), eventsUnavailable: input.events === null,
    kpi, actions, grid, watch,
  };
}

/**
 * 퀴즈 문항 분석 (D5 · P4-01): 같은 문제 버전의 첫 응시만 모아 문항별 정답률(p값)과 보기별 선택 수를 셉니다.
 * questions: 그 버전의 문항 · version: 버전 번호 · results: 차시의 quizResults 문서
 * deps: {normalizeQuizQuestion, isCorrectAnswer, answersFor}
 * 변별도(상·하위 집단 정답률 차이)는 소규모 반에서 통계적으로 불안정해 계산하지 않습니다.
 */
export function analyzeQuiz({ questions = [], version = null, results = [] }, deps) {
  const { normalizeQuizQuestion, isCorrectAnswer, answersFor } = deps;
  const qs = questions.map((q, i) => normalizeQuizQuestion(q, i));
  const included = [], otherVersions = {};
  let legacy = 0, unversioned = 0;
  for (const r of results) {
    const fa = r?.firstAttempt;
    if (!fa || fa.legacy === true) { legacy++; continue; }
    const v = Number(fa.quizVersion);
    if (!fa.quizVersion || !Number.isFinite(v)) { unversioned++; continue; }
    if (v !== Number(version)) { otherVersions[v] = (otherVersions[v] || 0) + 1; continue; }
    included.push(answersFor(fa, qs));
  }
  const items = qs.map((q, qi) => {
    const optionCounts = q.options.map(() => 0);
    let n = 0, correct = 0;
    for (const answers of included) {
      const picked = answers[qi] || [];
      if (!picked.length) continue; // 답이 없는 문항은 그 문항의 n에서 뺍니다
      n++;
      if (isCorrectAnswer(q, picked)) correct++;
      for (const i of new Set(picked)) if (i >= 0 && i < optionCounts.length) optionCounts[i]++;
    }
    const wrongMax = Math.max(0, ...optionCounts.filter((c, i) => !q.correctIndices.includes(i)));
    return {
      index: qi, id: q.id, type: q.type, stem: q.stem || '', options: q.options, correctIndices: q.correctIndices, explanation: q.explanation || '',
      n, correct, p: ratio(correct, n), optionCounts,
      topWrong: wrongMax > 0 ? optionCounts.map((c, i) => (c === wrongMax && !q.correctIndices.includes(i) ? i : -1)).filter(i => i >= 0) : [],
    };
  });
  // 정답률이 낮은 문항부터. 응시가 없는 문항은 맨 뒤
  const sorted = [...items].sort((a, b) => (a.p === null) - (b.p === null) || (a.p ?? 0) - (b.p ?? 0) || a.index - b.index);
  return { version, n: included.length, items: sorted, otherVersions, legacy, unversioned };
}
