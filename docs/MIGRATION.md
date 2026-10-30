# 강사(아내) 계정으로 저장소 옮기기 (2026-10-30 작성)

> 옮긴 뒤에는 Claude가 새 저장소에 바로 접근할 수 없으므로(다시 연결하는 방법은 7장), 이 문서만 보고 끝까지 할 수 있게 적었습니다.
> 아래에서 `아내아이디`는 아내분 GitHub 아이디, `senorayu`는 새 저장소 이름(예시)입니다. 실제 값으로 바꿔 읽으세요.
> 주소에 들어가는 아이디는 **소문자**입니다(예: 아이디가 `SenoraYu`이면 주소는 `senorayu.github.io`).

## 0. 한눈에 보기

| 구분 | 내용 |
|---|---|
| 옮기는 것 | **저장소 전체**(아래 표의 모든 파일·폴더, 변경 기록, 브랜치). GitHub의 '소유권 이전(Transfer)' 한 번으로 옮깁니다. 파일을 하나씩 내려받아 새 저장소에 올리지 않습니다(숨김 파일 `.firebaserc`·`.gitignore`가 빠지거나 일부만 올라가는 실수를 막기 위해). |
| 그대로인 것 | **Firebase 프로젝트 `senora-c9b84` 전체**(정인혁 님 계정): 로그인 계정, 반·과제·질문 기록, 올린 파일(영상·음성·자료), 게시한 보안 규칙, 알림 함수(Cloud Functions 4개), Storage CORS. 앱 코드의 Firebase 연결값(`common.js`)도 그대로입니다. |
| 바뀌는 것 | **사이트 주소.** `https://2nhyeok.kr/tstst/` → `https://아내아이디.github.io/senorayu/`. 옛 주소는 열리지 않게 됩니다(GitHub는 저장소 주소는 새 위치로 넘겨주지만 GitHub Pages 주소는 넘겨주지 않습니다). |
| 주소가 바뀌어서 할 일 | Firebase 승인된 도메인 추가, Storage CORS에 새 주소 추가, API 키 웹사이트 제한 확인, 새 주소에서 다시 로그인·앱 설치·알림 켜기, 학생 안내 |
| 코드 수정 | **없음.** 화면 파일이 서로를 모두 상대 경로로 부르고, 코드 안에 사이트 주소를 적어 둔 곳이 없습니다. 2026-10-30에 시나리오 테스트 전체(109개)를 다른 호스트·하위 경로(`http://senorayu.localhost:8123/senorayu/`)로 띄워 모두 통과했습니다. |
| 옮기기 직전 수정 | 새로 가입한 수강생의 '내 이름'이 새로고침 전까지 '수강생'으로 보이던 문제(2026-10-30, 캐시 버전 `20261030f`)까지 `main`에 들어가 있습니다. 옮기면 이 수정도 함께 갑니다. |

### 누가 무엇을
| 순서 | 하는 사람 | 할 일 | 장 |
|---|---|---|---|
| 1 | 정인혁 | 옮기기 전 확인 | 1 |
| 2 | 정인혁 → 아내 | 소유권 이전 요청 → 이메일로 수락(하루 안) | 2 |
| 3 | 아내 | 저장소 이름 바꾸기, GitHub Pages 확인 | 2 · 3 |
| 4 | 정인혁 | Firebase · Google Cloud에 새 주소 등록 | 4 |
| 5 | 두 분 | 새 주소에서 동작 확인, 아내분 휴대폰에 앱 설치·알림 켜기 | 5 |
| 6 | 정인혁 | 옛 주소 정리, 학생 안내 | 6 |

한 번에 이어서 하는 것을 권합니다. 2번과 4번 사이에는 새 주소에서 로그인이 막힐 수 있습니다(4-3 상황일 때).

### 옮겨지는 파일(저장소 전체)

| 파일·폴더 | 하는 일 | 옮긴 뒤 |
|---|---|---|
| `index.html` | 학생 화면 | 그대로 |
| `admin.html` | 강사 화면 | 그대로 |
| `common.js` | 두 화면 공통 코드 + Firebase 연결값(`firebaseConfig`) | 그대로(같은 Firebase 프로젝트를 쓰므로 고치지 않음) |
| `dashboard.js` · `classexport.js` | 대시보드 집계 · 반 내보내기 | 그대로 |
| `common.css` · `student.css` · `admin.css` | 화면 디자인 | 그대로 |
| `senorayu-*.svg/png/jpg` | 로고 · 앱 아이콘 · 배너 | 그대로 |
| `admin.webmanifest` · `admin-sw.js` · `push-view.js` | 강사 앱 설치 정보 · 알림 받기 | 그대로(앱 주소를 스스로 계산) |
| `firestore.rules` · `storage.rules` | 보안 규칙 원본 | 그대로. 규칙은 Firebase 콘솔에 게시된 것이 적용되므로 옮기는 것과 상관없음 |
| `functions/` · `firebase.json` · `.firebaserc` | 알림 함수 원본과 배포 설정(프로젝트 `senora-c9b84`) | 그대로. 함수는 이미 Firebase에 배포되어 돌고 있음 |
| `tests/` | 자동 테스트 | 그대로 |
| `README.md` · `docs/` | 설명서와 문서(이 문서 포함) | 그대로 |
| `.gitignore` | 저장소에 올리지 않을 파일 목록(숨김 파일) | 그대로 |

**저장소에 없는 것(옮길 일 없음):** Firestore 데이터, Storage 파일, 학생 계정, 배포된 함수, CORS 설정. 모두 Firebase · Google Cloud(정인혁 님 계정)에 있습니다.

## 1. 옮기기 전 확인 (정인혁 님)

- [ ] 아내분 GitHub 아이디를 확인하고, 아내분이 GitHub에 로그인할 수 있고 가입 이메일을 받을 수 있는지 확인합니다.
- [ ] 아내분 계정에 `tstst`라는 저장소가 이미 있으면 옮길 수 없습니다(같은 이름 불가). 있으면 그쪽 이름을 먼저 바꿉니다.
- [ ] 새 저장소 이름을 정합니다(예: `senorayu`). 이름이 주소에 들어가므로, 개강 뒤에 바꾸면 앱 설치 · 알림 · 학생 안내를 다시 해야 합니다.
- [ ] 저장소가 **공개(Public)** 인지 봅니다(2026-10-30 기준 공개). 무료 계정에서 GitHub Pages를 쓰려면 공개 저장소여야 합니다.
- [ ] Firestore 규칙(2026-10-30, `adminDevices` 포함)을 콘솔에 게시했는지 확인합니다. 게시하지 않았으면 5장의 '알림 켜기'가 권한 오류로 막힙니다.
- [ ] Claude에게 맡길 코드 수정이 남아 있으면 **옮기기 전에** 끝냅니다. 예: 웹 푸시 인증서(VAPID) 공개 키를 쓰고 싶으면 지금 키를 주시거나, 옮긴 뒤 GitHub 웹 편집기로 `admin.html`의 `PUSH_VAPID_KEY` 한 줄을 고칩니다(선택 사항, 비워 두어도 알림은 동작).
- [ ] 2nhyeok.kr은 지금처럼 정인혁 님 계정에 둡니다. 새 사이트는 `아내아이디.github.io` 주소를 씁니다(2nhyeok.kr 하위 주소를 쓰려면 9장).

## 2. 소유권 이전

**정인혁 님(지금 주인)**
1. `https://github.com/hyogiman/tstst` → 위쪽 **Settings**(톱니바퀴) → 왼쪽 **General** 화면 맨 아래 빨간 테두리 **Danger Zone** → *Transfer ownership* 줄의 **Transfer**.
2. 열린 화면에서
   - 새 주인(New owner): 조직 목록이 아니라 '아이디 직접 입력' 쪽을 고르고 `아내아이디` 입력
   - 확인 칸: 화면이 요구하는 글자(`hyogiman/tstst`)를 그대로 입력
   - **I understand, transfer this repository** 클릭. 비밀번호나 2단계 인증을 다시 물으면 입력합니다.
   - GitHub 화면 문구는 조금씩 바뀔 수 있지만 순서는 같습니다.

**아내분(새 주인)**
3. GitHub에서 온 '저장소를 넘겨받겠느냐'는 이메일의 링크를, 아내분 GitHub에 로그인한 상태에서 열어 **수락**합니다. **하루 안에** 수락해야 하고, 지나면 요청이 만료되어 1번부터 다시 합니다.
4. 수락하면 저장소가 `https://github.com/아내아이디/tstst`로 옮겨집니다.
   - 개인 계정끼리 옮기면 정인혁 님은 자동으로 **협업자(Collaborator)** 가 되어 계속 파일을 고칠(push) 수 있습니다.
   - 옛 주소 `github.com/hyogiman/tstst`로 들어가면 새 저장소로 넘어갑니다.

**이름 바꾸기(권장, 아내분)**
5. 새 저장소 → **Settings** → **General** 맨 위 **Repository name**을 `senorayu`로 고치고 **Rename**.
   - 이름 바꾸기와 3장의 Pages 설정은 저장소 주인(아내분) 계정에서 합니다. 개인 계정 저장소의 협업자에게는 Settings 메뉴가 보이지 않을 수 있습니다.

> 주의: 옮긴 뒤 정인혁 님 계정에 `tstst`라는 저장소를 새로 만들지 마세요. 옛 저장소 주소에서 새 저장소로 넘겨주는 연결이 끊깁니다.

## 3. GitHub Pages 확인 (새 저장소, 아내분 계정)

6. 새 저장소 → **Settings** → 왼쪽 **Pages** → *Build and deployment*가 아래와 같은지 봅니다. 다르면 맞추고 **Save**.
   - **Source:** Deploy from a branch
   - **Branch:** `main`, 폴더 `/ (root)`
   - **Custom domain:** 비워 둠
7. 같은 화면 위에 *Your site is live at `https://아내아이디.github.io/senorayu/`* 가 보이면 됩니다. **이 주소가 앞으로의 앱 주소**입니다(4장에서는 여기서 `https://`와 `/senorayu/`를 뺀 `아내아이디.github.io`를 등록). 저장소 **Actions** 탭의 *pages build and deployment*가 초록색 체크인지도 봅니다(이 저장소는 지금까지 1분 안쪽에 끝났음).
8. 주소 확인(이 단계에서는 화면이 뜨는지만 봅니다. 로그인은 4장을 마친 뒤)
   - 학생 화면: `https://아내아이디.github.io/senorayu/`
   - 강사 화면: `https://아내아이디.github.io/senorayu/admin.html`
9. 몇 분이 지나도 404이면 차례로 해 봅니다.
   1. **Actions** 탭 → *pages build and deployment* → 가장 최근 실행 → **Re-run all jobs**
   2. **Settings → Pages**에서 Branch를 **None**으로 Save → 다시 `main` · `/ (root)`로 Save
   3. 아내분 계정으로 저장소의 `README.md`를 열어 연필(편집) 아이콘 → 아무 문장 끝에 공백 하나 → **Commit changes**(새 배포가 시작됨)

## 4. Firebase · Google Cloud (정인혁 님 계정) — 새 주소 등록

### 4-1. 로그인 승인된 도메인
1. Firebase 콘솔 → 프로젝트 `senora-c9b84` → 왼쪽 **빌드** → **Authentication** → 위쪽 **설정** 탭 → **승인된 도메인**.
2. **도메인 추가** → `아내아이디.github.io` (소문자, 앞의 `https://`와 뒤의 `/senorayu/` 없이) → **추가**.
3. `2nhyeok.kr`은 새 주소에서 모든 확인(5장)이 끝난 뒤에 지웁니다. 기본으로 들어 있는 `localhost`, `senora-c9b84.firebaseapp.com` 등은 그대로 둡니다.
- 참고: 이 목록은 구글 로그인 같은 팝업·리디렉션 로그인과 '앱으로 돌아가기' 주소가 있는 메일 링크에서 확인합니다(Firebase 문서). 이 앱이 쓰는 이메일·비밀번호 로그인도 이 목록을 확인하는지는 공식 문서로 확인하지 못했습니다. 넣어 두어 손해가 없고, 나중에 구글 로그인 등을 붙이면 꼭 필요합니다.

### 4-2. Storage CORS (반 내보내기의 음성 파일)
반 내보내기에서 음성 파일을 ZIP에 넣는 기능만 해당합니다(영상·음성 재생, 이미지, 첨부 열기는 CORS와 상관없음). Google Cloud 콘솔 → 위쪽 프로젝트가 `senora-c9b84`인지 확인 → 오른쪽 위 Cloud Shell. 옛 주소와 새 주소를 함께 넣습니다(`cors set`은 기존 설정을 통째로 바꿈). `origin`에는 경로(`/senorayu/`)를 넣지 않습니다.

```bash
echo '[{"origin":["https://2nhyeok.kr","https://아내아이디.github.io"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
```

```bash
gsutil cors set cors.json gs://senora-c9b84.firebasestorage.app
```

```bash
gsutil cors get gs://senora-c9b84.firebasestorage.app
```

마지막 명령 결과에 두 주소가 보이면 됩니다.

### 4-3. API 키 웹사이트 제한 확인
1. Google Cloud 콘솔 → 프로젝트 `senora-c9b84` → 왼쪽 메뉴 **API 및 서비스** → **사용자 인증 정보**.
2. *API 키* 목록에서 `common.js`의 `apiKey`(AIza…로 시작)와 같은 키(보통 *Browser key (auto created by Firebase)*)를 엽니다. '키 표시'로 값을 비교할 수 있습니다.
3. **애플리케이션 제한사항**이 *없음*이면 할 일 없음. *웹사이트*로 제한되어 있으면 **웹사이트 제한사항**에 `https://아내아이디.github.io/*`를 추가하고 **저장**합니다. 빠뜨리면 새 주소에서 로그인과 데이터 읽기가 막힙니다.
- 같은 화면의 **API 제한사항**(어떤 API를 쓸 수 있는지)은 주소와 상관없으니 건드리지 않습니다.

### 4-4. 알림 함수(Cloud Functions)
할 일 없습니다. 함수는 Firebase 프로젝트에서 돌고, 알림에는 화면 위치(예: `questions?class=…`)만 담깁니다. 주소는 휴대폰에 설치된 앱이 스스로 붙입니다(새 주소에서 설치한 앱은 새 주소로 엶).

## 5. 새 주소에서 동작 확인

> 로그인 상태와 기기의 임시 저장 내용(작성 중 답안·피드백 초안, 고른 차시 등)은 주소마다 따로 저장되므로, 새 주소에서는 모두 **한 번 다시 로그인**합니다. 서버에 저장된 기록은 그대로입니다. 학생 쪽 확인은 실제 학생 대신 시험 학생 계정으로 합니다.

**강사(PC 크롬, `…/senorayu/admin.html`)**
- [ ] 로그인 → 대시보드 숫자 · 처리할 일이 보임
- [ ] 클래스 관리: 반 목록, 수강 코드 복사
- [ ] 차시별 학습자료: 차시를 열고 예습 글 저장, 작은 파일 첨부 · 영상 올리기(또는 유튜브 링크), 저장 후 다시 열어 그대로인지
- [ ] 과제·복습 관리: 학생 답안 보기, 글 피드백 저장, (가능하면) 음성 피드백 녹음 저장
- [ ] 질문함 답변, 공지사항 올리기, 출석 입력
- [ ] 클래스 관리 → **내보내기** → [음성까지 내려받기] → ZIP 안 `README.txt` 맨 아래에 '내려받지 못한 음성 파일'이 없는지(4-2 확인)

**학생(휴대폰, 시험 계정, `…/senorayu/`)**
- [ ] 새 시험 계정으로 **회원가입** → 수강 코드 입력 → 새로고침 없이 **내 정보의 '내 이름'** 과 홈 인사에 가입 때 쓴 이름이 보이는지(이관 직전 수정 확인).
  - 실제 반 대신 클래스 관리에서 만든 **시험용 반**의 수강 코드로 하면, 다 본 뒤 그 반을 영구 삭제해 시험 기록(수강 등록·반 명단·과제·질문)을 함께 지울 수 있습니다. 수강생 관리에는 삭제가 없고 '수강 중지'만 있습니다.
  - 시험 계정 자체는 Firebase 콘솔 → Authentication → 사용자에서 지울 수 있습니다(두어도 문제없음).
- [ ] 로그인 → 홈(다음 수업 · 할 일)
- [ ] 예습: 글 · 영상 재생 · 첨부 열기
- [ ] 과제: 글 제출, 음성 녹음 제출(마이크 허용)
- [ ] 복습: 퀴즈 풀기, 수업 영상 재생
- [ ] 질문 남기기, 공지 읽기

**알림(아내분 안드로이드)**
- [ ] Chrome으로 `…/senorayu/admin.html` → 메뉴(⋮) → **앱 설치**(또는 '홈 화면에 추가'. '설치'와 '바로가기 만들기' 중 고르라고 하면 **설치**)
- [ ] 홈 화면 '쎄뇨라유 강사' 아이콘으로 열기 → 로그인
- [ ] 위쪽 **🔔 알림** → **이 기기에서 알림 받기** → 허용 → **테스트 알림 보내기** → 몇 초 안에 알림
- [ ] 학생 시험 계정으로 질문 남기기 → "❓ 이름 · 새 질문" 알림 → 누르면 그 질문이 열림
- [ ] 학생 시험 계정으로 과제 제출 → "📝 … 과제 제출" 알림

## 6. 정리
- [ ] 🔔 알림 → 알림 받는 기기에서, 옮기기 전에 시험으로 켠 기기(옛 주소)를 지웁니다. 남겨 두면 옛 주소 앱으로 알림이 가고, 누르면 열리지 않는 옛 주소로 갑니다.
- [ ] 모든 확인이 끝나면 4-1의 승인된 도메인에서 `2nhyeok.kr`을 지우고, 4-2는 새 주소만 넣어 명령을 다시 실행합니다(4-3에서 옛 주소를 넣어 두었다면 그것도 지움).
- [ ] 학생에게 새 주소를 안내합니다(옛 주소는 열리지 않음).
- [ ] (선택) 저장소의 `claude/…` 작업 브랜치는 지워도 됩니다(내용은 모두 `main`에 들어가 있음).

## 7. 옮긴 뒤 고칠 일이 생기면
- 지금의 Claude 작업 세션은 `hyogiman/tstst`에 연결되어 있어, 옮긴 저장소를 바로 고칠 수 없습니다.
- 다시 Claude와 작업하려면
  1. 아내분이 GitHub에 로그인한 상태에서 Claude GitHub 앱 설치 화면(`https://github.com/apps/claude/installations/select_target`)을 열어 아내분 계정을 고르고, *Only select repositories*에서 `senorayu`를 골라 설치합니다(저장소 주인만 설치할 수 있음).
  2. 정인혁 님이 claude.ai에서 새 Claude Code 세션을 열 때 저장소 목록에서 `아내아이디/senorayu`를 고릅니다. 목록에 없으면 `https://claude.ai/connect-github`에서 GitHub 연결을 다시 하고 확인합니다.
- 간단한 수정(문구 하나 등)은 GitHub 웹에서 파일을 열고 연필 아이콘으로 고친 뒤 **Commit changes** → 1~2분 뒤 사이트에 반영됩니다. CSS · JS 파일을 고치면 README 3장의 캐시 버전(`?v=`)도 함께 올립니다.
- 알림 함수를 고쳐 다시 배포할 때는 README 9장 명령에서 저장소 주소를 `https://github.com/아내아이디/senorayu.git`로, 폴더를 `senorayu`로 씁니다.

## 8. 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 새 주소가 404 | 3장 6~9번(main · root, Actions 성공 여부, 주소 끝의 저장소 이름, 아이디 소문자) |
| 로그인할 때 `unauthorized-domain`이 들어간 오류 | 4-1 승인된 도메인 |
| 로그인할 때 `requests-from-referer`나 API 키가 들어간 오류 | 4-3 API 키 웹사이트 제한 |
| 내보내기 ZIP에 음성이 없음 | 4-2 CORS(`gsutil cors get` 결과에 새 주소가 있는지) |
| 알림 켜기에서 '권한' 오류 | Firestore 규칙(2026-10-30, `adminDevices`) 게시 여부 |
| 알림이 안 옴 | 휴대폰 설정 → 알림에서 '쎄뇨라유 강사'(또는 Chrome) 허용, 🔔 상태가 '받고 있어요'인지, Cloud Shell에서 `npx firebase-tools@latest functions:log --project senora-c9b84` |
| 알림을 누르면 열리지 않는 주소로 감 | 옛 주소에서 켠 기기로 온 알림. 새 주소 앱에서 알림을 켜고 옛 기기를 지움(6장) |

## 9. (선택) 2nhyeok.kr 주소를 계속 쓰고 싶다면
새 사이트에 `spanish.2nhyeok.kr` 같은 하위 도메인을 붙일 수 있습니다(도메인 업체에서 `spanish` CNAME → `아내아이디.github.io`, 새 저장소 Settings → Pages → Custom domain). 다만 정인혁 님 GitHub 계정에서 2nhyeok.kr을 **도메인 확인(verified)** 해 두었다면, 그 도메인과 바로 아래 하위 도메인은 정인혁 님 계정의 저장소만 쓸 수 있어 먼저 정리가 필요합니다. 이 경우에도 4-1 · 4-2 · 4-3에 새 주소를 넣어야 합니다. 개강 전에 주소를 확정한 뒤 앱 설치 · 학생 안내를 하세요.

## 참고 자료
- GitHub Docs, [Transferring a repository](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/transferring-a-repository) (Pages 주소는 넘겨주지 않음, 하루 안 수락)
- GitHub Docs, [About repository transfers](https://docs.github.com/enterprise-server@3.22/articles/about-repository-transfers/) (개인 계정끼리 옮길 때 원래 주인은 협업자로 추가)
- GitHub Docs, [Troubleshooting 404 errors for GitHub Pages sites](https://docs.github.com/en/enterprise-server@3.7/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites)
- GitHub Docs, [Verifying your custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- Firebase, [이메일 링크 인증](https://firebase.google.com/docs/auth/web/email-link-auth) (승인된 도메인) · [웹에서 파일 다운로드](https://firebase.google.com/docs/storage/web/download-files) (CORS)
- Google Cloud, [API 키 제한사항 추가](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
