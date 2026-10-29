// 테스트용 가상 데이터. 실제 인물·수업과 무관합니다.
// 날짜는 실행 시점(한국 시간) 기준 상대 날짜로 만듭니다.
'use strict';

const DAY = 86400000;
const ts = ms => ({ __ts: ms });
const iso = ms => new Date(ms).toISOString();
// 한국 시간 기준 날짜 문자열
function kstDate(ms) {
  const d = new Date(ms + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}
function kstAt(dateStr, hh = 19, mm = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hh - 9, mm);
}

function makeSeed(now = Date.now()) {
  const docs = {};
  const files = {};
  const put = (path, data) => { docs[path] = data; };

  // ----- 사용자 -----
  const authUsers = [
    { uid: 'admin1', email: 'teacher@example.com', password: 'password1', displayName: '유진' },
    { uid: 's1', email: 'minji@example.com', password: 'password1', displayName: '김민지' },
    { uid: 's2', email: 'junho@example.com', password: 'password1', displayName: '이준호' },
    { uid: 's3', email: 'seoyeon@example.com', password: 'password1', displayName: '박서연' },
    { uid: 's4', email: 'doyun@example.com', password: 'password1', displayName: '최도윤' },
    { uid: 's5', email: 'haeun@example.com', password: 'password1', displayName: '정하은' },
    { uid: 's6', email: 'jiwoo@example.com', password: 'password1', displayName: '한지우' },
    { uid: 's7', email: 'serin@example.com', password: 'password1', displayName: '오세린' },
  ];
  put('users/admin1', { role: 'admin', displayName: '유진', email: 'teacher@example.com', createdAt: ts(now - 90 * DAY) });
  const student = (uid, name, assigned, extra = {}) => put('users/' + uid, {
    role: 'student', displayName: name, realName: name, nickname: '', email: authUsers.find(u => u.uid === uid).email,
    createdAt: ts(now - 60 * DAY), ...(assigned ? { assignedClassId: assigned } : {}), ...extra,
  });
  student('s1', '김민지', 'c1');
  student('s2', '이준호', 'c1');
  student('s3', '박서연', 'c1');
  student('s4', '최도윤', 'c1');
  student('s5', '정하은', 'c3');
  student('s6', '한지우', null);
  student('s7', '오세린', 'c2');

  // ----- 반 -----
  const sessionsC1 = [
    ['1차시 · 인사와 자기소개', -28], ['2차시 · ser 동사와 국적', -21], ['3차시 · estar 동사와 기분', -14],
    ['4차시 · 숫자와 나이', -7], ['5차시 · 카페에서 주문하기', 0], ['6차시 · 하루 일과', 7],
    ['7차시 · 가족 소개', 14], ['8차시 · 쇼핑', 21], ['9차시 · 길 묻기', 28],
    ['10차시 · 날씨와 계절', 35], ['11차시 · 과거 이야기', 42], ['12차시 · 종합 복습', 49],
  ];
  const c1Dates = sessionsC1.map(([, off]) => kstDate(now + off * DAY));
  put('classes/c1', {
    name: '스페인어 기초반 2기', description: '목요일 저녁 7시', joinCode: 'HOLA2026', archived: false,
    createdAt: ts(now - 40 * DAY), createdBy: 'admin1',
    schedule: sessionsC1.map(([label], i) => ({ weekId: 'w' + (i + 1), label, date: c1Dates[i] })),
  });
  put('classes/c2', {
    name: '스페인어 회화반', description: '토요일 오전 10시', joinCode: 'CHARLA26', archived: false,
    createdAt: ts(now - 35 * DAY), createdBy: 'admin1',
    schedule: [1, 2, 3, 4].map(i => ({ weekId: 'cw' + i, label: i + '차시', date: kstDate(now + (i * 7 - 14) * DAY) })),
  });
  put('classes/c3', {
    name: '왕초보반 1기', description: '종료된 반', joinCode: 'OLA2025', archived: true,
    createdAt: ts(now - 200 * DAY), createdBy: 'admin1',
    schedule: [1, 2].map(i => ({ weekId: 'ow' + i, label: i + '차시', date: kstDate(now - (120 - i * 7) * DAY) })),
  });
  put('joinCodes/HOLA2026', { classId: 'c1', createdBy: 'admin1', updatedAt: ts(now - 40 * DAY) });
  put('joinCodes/CHARLA26', { classId: 'c2', createdBy: 'admin1', updatedAt: ts(now - 35 * DAY) });
  put('joinCodes/OLA2025', { classId: 'c3', createdBy: 'admin1', updatedAt: ts(now - 200 * DAY) });

  // ----- 수강 등록 -----
  const enroll = (uid, cid, status, name, joinedDaysAgo) => put(`enrollments/${uid}_${cid}`, {
    uid, classId: cid, studentName: name, email: authUsers.find(u => u.uid === uid).email,
    joinCode: docs['classes/' + cid].joinCode, status, joinedAt: ts(now - joinedDaysAgo * DAY),
  });
  enroll('s1', 'c1', 'active', '김민지', 32);
  enroll('s2', 'c1', 'active', '이준호', 31);
  enroll('s3', 'c1', 'active', '박서연', 20);
  enroll('s3', 'c2', 'transferred', '박서연', 34);
  enroll('s4', 'c1', 'inactive', '최도윤', 30);
  enroll('s5', 'c3', 'active', '정하은', 150);
  enroll('s7', 'c2', 'active', '오세린', 33);
  const member = (cid, uid, name, status, joinedDaysAgo) => put(`classes/${cid}/members/${uid}`, { uid, name, status, joinedAt: ts(now - joinedDaysAgo * DAY) });
  member('c1', 's1', '김민지', 'active', 32);
  member('c1', 's2', '이준호', 'active', 31);
  member('c1', 's3', '박서연', 'active', 20);
  member('c1', 's4', '최도윤', 'inactive', 30);
  member('c2', 's7', '오세린', 'active', 33);
  member('c2', 's3', '박서연', 'transferred', 34);
  member('c3', 's5', '정하은', 'active', 150);
  put('classes/c1/teacherNotes/s2', { text: '출장이 잦아 불참 가능성 있음.\n과제는 음성 제출을 선호함.', studentUid: 's2', updatedAt: ts(now - 10 * DAY), updatedBy: 'admin1' });

  // ----- 차시 콘텐츠 -----
  const q = (id, type, stem, options, correctIndices, explanation = '') => ({ id, type, stem, options, correctIndices, correctIndex: correctIndices[0], explanation });
  const quizzes = {
    w1: [
      q('q11', 'single', 'Buenas noches는 무슨 뜻인가요?', ['좋은 아침이에요', '안녕하세요(오후 인사)', '좋은 밤 되세요 / 안녕히 주무세요', '감사합니다'], [2], '저녁·밤 인사입니다. 오후 인사는 Buenas tardes.'),
      q('q12', 'multiple', '다음 중 인사말을 모두 고르세요.', ['Hola', 'Gracias', 'Buenos días', 'Perro'], [0, 2], 'Gracias는 감사 표현, Perro는 개(동물)입니다.'),
      q('q13', 'ox', '“Mucho gusto”는 “만나서 반가워요”라는 뜻이다.', ['O', 'X'], [0], ''),
    ],
    w2: [
      q('q21', 'single', 'Yo ___ coreano. 빈칸에 알맞은 것은?', ['soy', 'eres', 'es', 'somos'], [0], 'yo에는 soy를 씁니다.'),
      q('q22', 'multiple', 'ser 동사의 현재형을 모두 고르세요.', ['soy', 'estoy', 'eres', 'tengo'], [0, 2], 'estoy는 estar, tengo는 tener 동사입니다.'),
      q('q23', 'ox', '“Ella es de Corea.”는 “그녀는 한국 출신이다”라는 뜻이다.', ['O', 'X'], [0], ''),
    ],
    w3: [
      q('q31', 'single', '¿Cómo ___ (tú)? 빈칸에 알맞은 것은?', ['estás', 'eres', 'está', 'son'], [0], '상태를 물을 때는 estar를 씁니다.'),
      q('q32', 'ox', '기분이나 일시적인 상태를 말할 때는 보통 ser를 쓴다.', ['O', 'X'], [1], '일시적인 상태에는 estar를 씁니다.'),
      q('q33', 'multiple', 'estar 동사의 현재형을 모두 고르세요.', ['estoy', 'soy', 'están', 'es'], [0, 2], ''),
    ],
    w4: [
      q('q41', 'single', 'Tengo veinte años. 몇 살인가요?', ['12살', '20살', '30살', '2살'], [1], 'veinte = 20'),
      q('q42', 'ox', '나이를 말할 때는 tener 동사를 쓴다.', ['O', 'X'], [0], 'Tengo 20 años.'),
      q('q43', 'single', '15를 스페인어로 하면?', ['cinco', 'quince', 'cincuenta', 'trece'], [1], 'cinco 5 · quince 15 · cincuenta 50 · trece 13'),
    ],
  };
  const emptyPreview = { enabled: false, title: '다음 차시', mode: 'rich', richHtml: '', imagePath: '', videos: [], files: [] };
  sessionsC1.forEach(([label], i) => {
    const wid = 'w' + (i + 1);
    const n = i + 1;
    const date = c1Dates[i];
    const hasWork = n <= 4;
    put(`classes/c1/weeks/${wid}`, {
      label, order: n, sessionDate: date, published: n <= 5,
      assignment: hasWork
        ? { enabled: true, title: ['자기소개 3문장 쓰고 녹음하기', '내 국적과 직업 소개하기', '오늘 기분을 estar로 말하기', '가족의 나이 말하기'][i],
            instructions: '수업에서 배운 표현으로 3문장 이상 써 보세요.\n녹음은 30초 안팎이면 충분해요.', allowText: true, allowAudio: true,
            dueAt: kstDate(now + (sessionsC1[i][1] + 6) * DAY) + 'T23:59' }
        : { enabled: false, title: '', instructions: '', allowText: true, allowAudio: true, dueAt: '' },
      quiz: hasWork ? { enabled: true, title: label.split(' · ')[1] + ' 복습', questions: quizzes[wid] } : { enabled: false, title: '단어 복습', questions: [] },
      preview: n === 5
        ? { enabled: true, title: '카페에서 주문하기', mode: 'rich',
            richHtml: '<h2>오늘 수업 전에 읽어 보세요</h2><p>카페에서 가장 많이 쓰는 표현은 <strong>Quisiera un café, por favor.</strong> (커피 한 잔 주세요)입니다.</p><ul><li>¿Cuánto cuesta? — 얼마예요?</li><li>Para llevar — 포장이요</li></ul>',
            imagePath: '', videos: [], files: [{ path: 'classes/c1/previews/w5/file/menu.pdf', name: '카페 메뉴판 단어장.pdf', size: 120000 }] }
        : n === 6 ? { ...emptyPreview, title: '하루 일과 표현', richHtml: '<p>초안</p>' } : emptyPreview,
      createdAt: ts(now - 40 * DAY),
    });
  });
  files['classes/c1/previews/w5/file/menu.pdf'] = 'file';
  ['cw1', 'cw2', 'cw3', 'cw4'].forEach((wid, i) => put(`classes/c2/weeks/${wid}`, {
    label: (i + 1) + '차시', order: i + 1, sessionDate: docs['classes/c2'].schedule[i].date, published: i < 2,
    assignment: { enabled: false, title: '', instructions: '', allowText: true, allowAudio: true, dueAt: '' },
    quiz: { enabled: false, title: '단어 복습', questions: [] }, preview: emptyPreview, createdAt: ts(now - 35 * DAY),
  }));
  ['ow1', 'ow2'].forEach((wid, i) => put(`classes/c3/weeks/${wid}`, {
    label: (i + 1) + '차시', order: i + 1, sessionDate: docs['classes/c3'].schedule[i].date, published: true,
    assignment: { enabled: false, title: '', instructions: '', allowText: true, allowAudio: true, dueAt: '' },
    quiz: { enabled: false, title: '단어 복습', questions: [] }, preview: emptyPreview, createdAt: ts(now - 200 * DAY),
  }));
  // 보관된 반(c3)의 지난 자료: 학생 s5가 영상만 빼고 열람할 수 있어야 함
  Object.assign(docs['classes/c3/weeks/ow1'], {
    label: '1차시 · 알파벳과 발음',
    assignment: { enabled: true, title: '알파벳 읽고 녹음하기', instructions: 'A부터 Z까지 읽어 보세요.', allowText: true, allowAudio: true, dueAt: '' },
    quiz: { enabled: true, title: '알파벳 복습', questions: [
      q('oq1', 'single', 'ñ는 어떻게 읽나요?', ['에네', '에녜', '엔', '니'], [1], 'ñ는 "에녜"라고 읽습니다.'),
      q('oq2', 'ox', 'h는 스페인어에서 보통 소리 내지 않는다.', ['O', 'X'], [0], ''),
    ] },
    preview: { enabled: true, title: '알파벳 수업 자료', mode: 'rich', richHtml: '<p>스페인어 알파벳은 27자입니다.</p>', imagePath: '',
      videos: [{ path: 'classes/c3/previews/ow1/video/lesson1.mp4', name: '1차시 강의.mp4', size: 900000000 }],
      files: [{ path: 'classes/c3/previews/ow1/file/abc.pdf', name: '알파벳 표.pdf', size: 50000 }] },
  });
  files['classes/c3/previews/ow1/video/lesson1.mp4'] = 'video';
  files['classes/c3/previews/ow1/file/abc.pdf'] = 'file';
  put('classes/c3/weeks/ow1/submissions/s5', {
    userId: 's5', studentName: '정하은', email: 'haeun@example.com', text: 'A, B, C, D, E...', audioPath: '', submittedAt: ts(now - 110 * DAY),
    feedbacks: [{ id: 'ofb1', text: '발음이 정확해요. ñ 발음을 한 번 더 들어 보세요.', audioPath: '', createdAt: iso(now - 109 * DAY), author: '유진' }],
  });
  put('classes/c3/weeks/ow1/quizResults/s5', {
    userId: 's5', studentName: '정하은', email: 'haeun@example.com', answers: [1, 0], score: 2, total: 2, submittedAt: ts(now - 110 * DAY),
    firstAttempt: { score: 1, total: 2, submittedAt: iso(now - 111 * DAY), answers: [0, 0], legacy: false }, attemptCount: 2,
  });
  put('classes/c3/weeks/ow1/attendance/s5', { status: 'present', note: '', updatedAt: ts(now - 113 * DAY) });
  put('classes/c3/questions/oq1', {
    uid: 's5', studentName: '정하은', title: 'll과 y 발음이 같은가요?', content: '지역마다 다르다고 들었어요.', status: 'answered',
    createdAt: ts(now - 112 * DAY), answeredAt: ts(now - 111 * DAY),
  });
  put('classes/c3/questions/oq1/replies/or1', { uid: 'admin1', role: 'admin', author: '유진', text: '많은 지역에서 같게 발음해요(예이스모).', createdAt: ts(now - 111 * DAY) });

  // ----- 출결 (D2 이전 형식의 지각·인정결석 기록 일부 포함) -----
  const att = (wid, uid, status) => put(`classes/c1/weeks/${wid}/attendance/${uid}`, { status, note: '', updatedAt: ts(kstAt(c1Dates[+wid.slice(1) - 1], 21)) });
  att('w1', 's1', 'present'); att('w1', 's2', 'present'); att('w1', 's3', 'excused'); att('w1', 's4', 'present');
  att('w2', 's1', 'present'); att('w2', 's2', 'late'); att('w2', 's3', 'present');
  att('w3', 's1', 'present'); att('w3', 's2', 'absent'); att('w3', 's3', 'present');
  att('w4', 's1', 'present'); att('w4', 's3', 'present');

  // ----- 과제 제출·피드백 -----
  const t = (i, days, hh = 21) => kstAt(c1Dates[i], hh) + days * DAY;
  put('classes/c1/weeks/w1/submissions/s1', {
    userId: 's1', studentName: '김민지', email: 'minji@example.com',
    text: '¡Hola! Me llamo Minji. Soy de Corea. Mucho gusto.', audioPath: '', submittedAt: ts(t(0, 1)),
    feedbacks: [{ id: 'fb1', text: '아주 자연스러워요! “Soy de Corea” 좋습니다.\n다음에는 직업도 한 문장 더해 볼까요?', audioPath: '', createdAt: iso(t(0, 2, 10)), author: '유진' }],
  });
  put('classes/c1/weeks/w1/submissions/s2', { userId: 's2', studentName: '이준호', email: 'junho@example.com', text: 'Hola, me llamo Junho.', audioPath: '', submittedAt: ts(t(0, 3)) });
  put('classes/c1/weeks/w1/submissions/s3', {
    userId: 's3', studentName: '박서연', email: 'seoyeon@example.com', text: '', audioPath: 'classes/c1/submissions/w1/s3/intro.webm', submittedAt: ts(t(0, 2)),
    feedbacks: [{ id: 'fb2', text: '발음이 또렷해요. ll 발음을 조금 더 연습해 봐요.', audioPath: 'classes/c1/feedback/w1/s3/fb2.webm', createdAt: iso(t(0, 3, 9)), author: '유진' }],
  });
  files['classes/c1/submissions/w1/s3/intro.webm'] = 'audio';
  files['classes/c1/feedback/w1/s3/fb2.webm'] = 'audio';
  // 피드백을 받은 뒤 다시 제출한 경우 (재검토 대기 시나리오)
  put('classes/c1/weeks/w2/submissions/s1', {
    userId: 's1', studentName: '김민지', email: 'minji@example.com',
    text: 'Soy Minji. Soy coreana y soy estudiante.', audioPath: '', submittedAt: ts(t(1, 3)),
    feedbacks: [{ id: 'fb3', text: 'coreana로 성을 맞춘 것 좋아요. 직업 앞 관사는 빼도 돼요.', audioPath: '', createdAt: iso(t(1, 2, 11)), author: '유진' }],
  });
  put('classes/c1/weeks/w3/submissions/s1', { userId: 's1', studentName: '김민지', email: 'minji@example.com', text: 'Hoy estoy cansada, pero estoy contenta.', audioPath: '', submittedAt: ts(t(2, 1)) });
  put('classes/c1/weeks/w3/submissions/s3', { userId: 's3', studentName: '박서연', email: 'seoyeon@example.com', text: 'Estoy bien. ¿Y tú?', audioPath: '', submittedAt: ts(t(2, 2)) });

  // ----- 복습 퀴즈 결과 -----
  // Firestore는 배열 안의 배열을 저장할 수 없어, 복수정답은 answersById(문항ID → 선택 목록)와 문자열 목록 answers로 저장합니다(배치 06).
  const byId = (ids, list) => Object.fromEntries(ids.map((id, i) => [id, list[i]]));
  const w1Ids = ['q11', 'q12', 'q13'];
  const rec = (list, version = 1) => ({ answers: list.map(a => a.join(',')), answersById: byId(w1Ids, list), questionIds: w1Ids, quizVersion: version });
  put('classes/c1/weeks/w1/quizResults/s1', {
    userId: 's1', studentName: '김민지', email: 'minji@example.com', ...rec([[2], [0, 2], [0]]), score: 3, total: 3, submittedAt: ts(t(0, 2)),
    firstAttempt: { score: 2, total: 3, submittedAt: iso(t(0, 1)), ...rec([[1], [0, 2], [0]]), legacy: false }, attemptCount: 2,
  });
  put('classes/c1/weeks/w1/quizResults/s1/attempts/a1', { userId: 's1', ...rec([[1], [0, 2], [0]]), score: 2, total: 3, attemptNumber: 1, submittedAt: ts(t(0, 1)) });
  put('classes/c1/weeks/w1/quizResults/s1/attempts/a2', { userId: 's1', ...rec([[2], [0, 2], [0]]), score: 3, total: 3, attemptNumber: 2, submittedAt: ts(t(0, 2)) });
  put('classes/c1/weeks/w1/quizResults/s2', {
    userId: 's2', studentName: '이준호', email: 'junho@example.com', ...rec([[0], [0], [0]]), score: 1, total: 3, submittedAt: ts(t(0, 4)),
    firstAttempt: { score: 1, total: 3, submittedAt: iso(t(0, 4)), ...rec([[0], [0], [0]]), legacy: false }, attemptCount: 1,
  });
  put('classes/c1/weeks/w1/quizResults/s2/attempts/a3', { userId: 's2', ...rec([[0], [0], [0]]), score: 1, total: 3, attemptNumber: 1, submittedAt: ts(t(0, 4)) });
  // 버전·문항 ID가 없던 이전 형식 결과(단일 정답 답만 숫자로 저장된 기록)
  put('classes/c1/weeks/w1/quizResults/s3', { userId: 's3', studentName: '박서연', email: 'seoyeon@example.com', answers: [2, 0, 0], score: 2, total: 3, submittedAt: ts(t(0, 2)) });
  put('classes/c1/weeks/w2/quizResults/s1', {
    userId: 's1', studentName: '김민지', email: 'minji@example.com', answers: ['0', '0,2', '0'], answersById: { q21: [0], q22: [0, 2], q23: [0] }, questionIds: ['q21', 'q22', 'q23'], quizVersion: 1,
    score: 3, total: 3, submittedAt: ts(t(1, 1)),
    firstAttempt: { score: 3, total: 3, submittedAt: iso(t(1, 1)), answers: ['0', '0,2', '0'], answersById: { q21: [0], q22: [0, 2], q23: [0] }, quizVersion: 1, legacy: false }, attemptCount: 1,
  });
  // 퀴즈 버전 사본(강사 전용): 차시 문서의 quiz.version과 함께 둡니다
  ['w1', 'w2', 'w3', 'w4'].forEach(wid => {
    docs[`classes/c1/weeks/${wid}`].quiz.version = 1;
    put(`classes/c1/weeks/${wid}/quizVersions/1`, { version: 1, questions: quizzes[wid], savedAt: ts(now - 40 * DAY), savedBy: 'admin1' });
  });

  // ----- 수강 기간 기록(배치 06) -----
  const ev = (eid, id, type, daysAgo, extra = {}) => put(`enrollments/${eid}/events/${id}`, { type, at: ts(now - daysAgo * DAY), by: 'admin1', ...extra });
  ev('s3_c2', 'e1', 'joined', 34, { by: 's3', toClassId: 'c2' });
  ev('s3_c2', 'e2', 'transferred_out', 20, { toClassId: 'c1' });
  ev('s3_c1', 'e3', 'transferred_in', 20, { fromClassId: 'c2' });
  ev('s4_c1', 'e4', 'joined', 30, { by: 's4', toClassId: 'c1' });
  ev('s4_c1', 'e5', 'stopped', 12);

  // ----- 질문 -----
  put('classes/c1/questions/q1', {
    uid: 's1', studentName: '김민지', title: '“Mucho gusto”와 “Encantada”의 차이가 궁금해요',
    content: '둘 다 “만나서 반가워요”라고 배웠는데, 언제 어떤 걸 쓰면 좋을까요?', status: 'answered', createdAt: ts(t(0, 2)), answeredAt: ts(t(0, 3)),
  });
  put('classes/c1/questions/q1/replies/r1', { uid: 'admin1', role: 'admin', author: '유진', text: '둘 다 써도 돼요! Encantado/Encantada는 말하는 사람의 성별에 맞춰 바뀌고, Mucho gusto는 그대로 씁니다.', createdAt: ts(t(0, 3)) });
  put('classes/c1/questions/q2', {
    uid: 's2', studentName: '이준호', title: '숫자 15와 50 발음이 헷갈려요',
    content: 'quince와 cincuenta를 들을 때 자꾸 헷갈립니다. 구분하는 요령이 있을까요?', status: 'open', createdAt: ts(t(3, 1)),
  });

  return { docs, authUsers, files };
}

module.exports = { makeSeed, kstDate, DAY };
