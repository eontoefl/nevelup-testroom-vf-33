# 테스트룸 인증 모듈·새 로그인 스위치 시험 (보안작업 묶음2 계약 3B)

`js/auth-session.js`(인증 모듈), `js/auth.js` 의 켜진 분기, `js/supabase-client.js` 의 연결점을 본다. 저장소의 스위치는 꺼짐이다.

**이 폴더의 시험은 전부 지어낸 값·가짜 서버로 돈다. 비밀값·운영 주소로의 요청은 없다.** 테스트룸은 저장소가 그대로 사이트로 공개되므로 이 폴더의 파일도 공개된다.

## 1. 회귀시험 — `node tests/auth-session/run.mjs`
저장소 폴더에서, Node v26. 설치할 것은 없다. 통과하면 마지막 줄이 `결과: 통과`, 종료 코드 0.
가짜 화면·가짜 서버다(프로세스 안, 실제 네트워크 요청 0건). 여기서 통과한 것은 실제 화면·실제 서버에서 된다는 증거가 아니다.

- 글자 점검: 스위치 꺼짐, 기존 줄의 변경(`js/auth.js` 는 책 연결의 조건 한 줄), 새 길의 열 목록 = 옛 함수, 로그아웃의 화면 정리 = 옛 길, 운영 흔적.
- 지금과 다른 것(차이 장부): 꺼짐의 화면이 기준(`cd66fcf`)보다 더 받는 정적 파일은 `index.html` 의 `js/auth-session.js` 1개뿐.
- 꺼짐 = 기준: 옛 길의 화면 동작 53가지(학생 유형별 로그인·새로 고침, 틀린 비밀번호, 빈 값, `999999`, 로그아웃, 책 연결 주소, 책 전용 상태 등)의 요청(주소·메서드·머리글·본문·횟수·순서)·탭 단위 저장값·화면 전환·안내·콘솔을 기준과 글자까지 대조.
- 켜짐: 같은 학생 유형에서 `currentUser`·화면이 옛 길과 같음, **저장 계획 = 옛 길의 실제 쓰기 요청**, 쓰기 전송 0, 회원 표 요청 0 / 들어가지 못하는 경우 / 실패와 "없음"의 구분 / 준비 신호·늦게 온 응답 / 로그아웃 / 새 창·탭 복제·탭 닫기 / 책의 길 / 연결점.
- 두 저장소의 모듈이 같은 규약: 공홈 `4341235` 의 `js/auth-session.js` 로 만든 기준표(`protocol-golden.json`)와 같은 입력 34가지·136걸음의 상태·이유·요청을 대조. 기준표는 `node tests/auth-session/protocol.mjs --write-golden <공홈의 js/auth-session.js 경로>` 로 다시 만든다.
- 시험 도구 자신: 차단기의 범위 규칙, 저장 계획 검사, 실행기의 차례·보관함·원복 표시, 로컬 서버의 몸통.
- 감도: 일부러 바꾼 사본 73개 — 변조마다 겨냥한 판정이 깨져야 검출로 센다.

가짜 화면의 한계: 화면 전체(`index.html` 의 스크립트 100여 개)를 올리지 않고 로그인에 관여하는 넷(`js/supabase-client.js`·`js/timezone-utils.js`·`js/auth-session.js`·`js/auth.js`)만 화면에 적힌 순서대로 올린다. 화면 전환(`showScreen`)은 호출을 적는 대역이다 — 일정 화면이 뜬 뒤의 요청은 여기에 없다.

## 2. 화면 시험 실행기 — `screen.mjs`
실제 Chromium 으로 실제 화면(`index.html` 전체)을 돈다. `--fake`(가짜 서버 — 작업방) / `--real`(시험 프로젝트 — 브레인방만). 쓰는 법·멈춤·결과 읽기는 `절차.md`.
경우 24개(P, F, S-유형 14, W, E, RG, LO, EX, MT, WN, OFF). P(차단의 예행)가 전부 통과해야 뒤의 경우를 시작한다.

## 3. 파일
- `run.mjs` 회귀시험. `scenarios.mjs` 옛 길의 화면 동작. `on-tests.mjs` 켜짐의 시험. `mutants.mjs` 변조. `tool-tests.mjs` 도구 자신의 시험. `protocol.mjs`·`protocol-golden.json` 규약 대조.
- `world.mjs`·`browser.mjs`·`fake-supabase.mjs`·`fake-rest.mjs`·`fixtures.mjs` 가짜 세계(탭 단위 저장소·`window.open`·탭 복제, 가짜 로그인 서버·가짜 표 요청, 합성 학생 유형 14가지).
- `screen.mjs` 실행기. `screen-core.mjs` 그 판단 부분. `request-log.mjs` 차단기. `serve-core.mjs`·`serve.mjs`·`rewrite.mjs` 시험용 로컬 서버와 "내줄 때 바꾸기".
- `sql/fixtures_up.sql`·`fixtures_reset.sql`·`fixtures_down.sql`·`state_rows.sql` 시험 프로젝트의 합성 자료(브레인방이 적용한다 — 작업방은 실행해 보지 않았다).
- `절차.md` 실제 화면·실제 DB 대조의 절차.

공홈 계약 3A 의 `tests/auth-session/` 에서 옮긴 것: `browser.mjs`·`fake-supabase.mjs`·`rewrite.mjs`·`serve-core.mjs`·`serve.mjs`·`request-log.mjs`·`screen-core.mjs`·`screen.mjs`(테스트룸에 맞게 손질).
