// 테스트 하네스: 운영 HTML을 그대로 띄우고 Firebase SDK 요청만 tests/mock 모듈로 바꿔 끼웁니다.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { makeSeed } = require('../fixtures/seed.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const MOCK_DIR = path.join(ROOT, 'tests', 'mock');
const FONT_DIR = process.env.PRETENDARD_DIR || path.join(ROOT, 'tests', '.cache', 'pretendard');
const BASE = 'http://localhost:8123/'; // localhost는 보안 컨텍스트라 마이크(getUserMedia)를 쓸 수 있습니다
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serveFile(route, file) {
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found: ' + file });
  return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
}

async function launch() {
  // 리눅스 언어 설정(LANG)이 비어 있으면 Chromium이 한글 내려받기 파일 이름을 'download'로 바꾸므로 UTF-8로 띄웁니다(반 내보내기 테스트).
  return chromium.launch({ env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
}

async function openApp(browser, { file = 'index.html', user = null, viewport = { width: 1280, height: 860 }, rules = 'v4', seed = makeSeed(), timezoneId = 'Asia/Seoul', blockCdn = false, bootTimeoutMs = null, context: existing = null } = {}) {
  const context = existing || await browser.newContext({ viewport, timezoneId, locale: 'ko-KR', permissions: ['microphone'], deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) {
      const rel = decodeURIComponent(url.slice(BASE.length).split(/[?#]/)[0]) || 'index.html';
      return serveFile(route, path.join(ROOT, rel));
    }
    if (url.startsWith('https://www.gstatic.com/firebasejs/13.1.0/')) return blockCdn ? route.abort() : serveFile(route, path.join(MOCK_DIR, url.split('/').pop().split('?')[0]));
    const font = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard@v1\.3\.9\/dist\/web\/(.+)$/);
    if (font) return serveFile(route, path.join(FONT_DIR, 'dist', 'web', font[1].replace('.min.css', '.css')));
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  await context.addInitScript(({ seed, user, rules, bootTimeoutMs }) => {
    window.__MOCK_SEED__ = seed; window.__MOCK_USER__ = user; window.__MOCK_RULES__ = rules;
    if (bootTimeoutMs) window.__BOOT_TIMEOUT_MS = bootTimeoutMs;
  }, { seed, user, rules, bootTimeoutMs });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + file);
  await page.waitForTimeout(400);
  return { context, page, errors };
}

// 화면에 뜬 토스트 문구 읽기
async function lastToast(page) { return page.evaluate(() => document.querySelector('#toast')?.textContent || ''); }
const pause = (page, ms = 300) => page.waitForTimeout(ms);

module.exports = { launch, openApp, lastToast, pause, BASE, ROOT };
