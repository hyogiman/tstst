// 정적 검사: node tests/lint.cjs
// 두 HTML의 <script type="module">과 common.js · dashboard.js · classexport.js에서 정의되지 않은 이름(import 누락 등)과 쓰지 않는 import를 찾습니다.
// ESLint가 필요합니다: npm i -g eslint 또는 ESLINT_PATH=/경로/node_modules/eslint
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function loadEslint() {
  const candidates = [process.env.ESLINT_PATH, 'eslint', '/opt/node-tools/node_modules/eslint'].filter(Boolean);
  for (const c of candidates) { try { return require(c); } catch (e) { /* 다음 후보 */ } }
  console.log('ESLint를 찾지 못했습니다. npm i -g eslint 후 다시 실행해 주세요.');
  process.exit(2);
}
const { ESLint } = loadEslint();

const browserGlobals = ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
  'URL', 'File', 'Blob', 'FormData', 'DOMParser', 'Node', 'CSS', 'MediaRecorder', 'crypto', 'Audio', 'Event', 'CustomEvent',
  'HTMLElement', 'KeyboardEvent', 'addEventListener', 'removeEventListener', 'getComputedStyle', 'performance', 'structuredClone',
  'alert', 'confirm', 'innerWidth', 'scrollTo', 'IntersectionObserver', 'ResizeObserver', 'AbortController', 'queueMicrotask', 'TextEncoder', 'CompressionStream', 'Response'];

const sources = [];
for (const file of ['index.html', 'admin.html']) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /<script type="module">([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const offset = html.slice(0, m.index).split('\n').length - 1; // 오류 줄 번호를 HTML 기준으로 맞춤
    sources.push({ name: file + (n ? `#${n}` : ''), code: '\n'.repeat(offset) + m[1] });
    n++;
  }
}
for (const file of ['common.js', 'dashboard.js', 'classexport.js']) sources.push({ name: file, code: fs.readFileSync(path.join(ROOT, file), 'utf8') });

(async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: Object.fromEntries(browserGlobals.map(g => [g, 'readonly'])) },
      rules: {
        'no-undef': 'error',
        'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }],
        'no-redeclare': 'error',
        'no-dupe-keys': 'error',
        'no-unreachable': 'error',
        'no-const-assign': 'error',
      },
    },
  });
  let problems = 0;
  for (const s of sources) {
    const [result] = await eslint.lintText(s.code, { filePath: path.join(ROOT, s.name.replace(/#\d+$/, '') + '.mjs') });
    for (const msg of result.messages) {
      problems++;
      console.log(`${s.name}:${msg.line}:${msg.column}  ${msg.ruleId || 'parse'}  ${msg.message}`);
    }
  }
  console.log(problems ? `\n${problems} problem(s)` : '정적 검사 통과 (정의되지 않은 이름·쓰지 않는 import 없음)');
  process.exit(problems ? 1 : 0);
})();
