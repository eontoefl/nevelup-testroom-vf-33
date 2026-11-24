# supabase-client.js 헤더 통합 회귀시험

`js/supabase-client.js`의 헤더 객체 2곳(`supabaseRequest`, `supabaseStorageUpload`)을 `supabaseHeaders(extra)` 하나로 모은 뒤에도, 화면이 보내는 요청과 응답 처리가 전과 같은지 확인한다. (보안작업 묶음2 계약1-나, 기준 커밋 `86af98d`)

## 실행

저장소 폴더에서, Node v26. 설치할 것은 없다.

```
node tests/supabase-client-headers/run.mjs
```

통과하면 마지막 줄이 `결과: 통과`이고 종료 코드가 0이다. 하나라도 다르면 `결과: 실패`와 종료 코드 1.

## 무엇을 비교하나

- 변경 전 파일(`git show 86af98d:js/supabase-client.js`)과 지금 파일을 각각 가짜 브라우저 환경(vm)에 올린다.
- 같은 합성 입력으로 부른다.
  - `supabaseRequest` 직접: 메서드, 본문 유무, `prefer` 값, `headers` 덮어쓰기(`Prefer`·`Content-Type`·`Authorization`·`apikey`·새 이름), `prefer`와 `headers.Prefer`를 함께 준 경우, 새 이름을 기존 이름과 섞은 경우, 주소의 한글·`&`·공백.
  - `supabaseStorageUpload`: `file.type`이 있는 경우·빈 문자열·없는 경우, 바이트가 다른 파일.
  - `supabaseRequest`를 거치는 함수 29개(조회·저장·수정·삭제).
- 호출마다 가짜 `fetch`에 넘어간 주소·메서드·헤더(이름·값·순서)·본문과, 가짜 응답(정상 JSON / 204 빈 응답 / JSON 아닌 본문 / 4xx·5xx / 네트워크 오류, 그리고 요청마다 응답이 달라지는 순서 7종)에 대한 반환값·`window._sgLastError`·console 출력·호출 뒤 인자와 `sessionStorage` 상태를 대조한다. 파일 올리기는 `x-upsert`와 본문으로 넘어간 파일의 MIME·바이트까지 본다.
- 시각은 고정한다. 원본이 `_sgLastError.at`에 `Date.now()`를 넣고 저장 본문에 `new Date()`를 넣기 때문에, 고정하지 않으면 시각 차이만으로 불일치가 난다.
- 변경 전·후 각각을 계약서의 모양과도 직접 대조한다(헤더 4개의 이름·값·순서와 덮어쓰기 규칙, 204는 `true`, 4xx는 `kind: 'server'`, 통신 실패는 `kind: 'network'`).
- 헤더 2곳과 새 함수를 뺀 나머지 텍스트가 같은지 본다. 줄바꿈(CRLF/LF)은 맞춘 뒤 비교한다 — 이 저장소는 내려받을 때 CRLF로 바뀌고 커밋에는 LF로 들어가기 때문이다.
- 파일 안의 함수 56개가 "fetch를 직접 부르는 2개 + 그것을 거치는 29개 + 요청 없이 계산만 하는 25개"로 빠짐없이 나뉘는지 확인한다. 계산만 하는 함수는 호출 수에 넣지 않는다.
- 변경 후 파일을 메모리에서만 일부러 바꾼 사본 12개를 같은 방식으로 돌려, 시험이 차이를 실제로 잡는지 확인한다.

## 지키는 것

- 실제 네트워크 요청 0건. 시험은 가짜 `fetch`만 쓰고, Node의 연결 경로(net·tls·http·https·http2·dns·dgram·전역 fetch 등)를 막아 둔다. 막아 둔 길로 요청이 나가려 하면 실패한다.
- 공개 키 값은 출력하지 않는다. 차이가 나면 "어느 호출의 어느 항목(헤더 이름)"만 찍는다.
- 입력은 전부 지어낸 값이다.

## 파일

- `run.mjs` — 실행 파일. 텍스트 점검, 동작 비교, 감도 점검, 결과 요약.
- `harness.mjs` — 네트워크 차단, 가짜 환경, 시각 고정, 호출 기록, 기록 비교.
- `cases.mjs` — 합성 입력과 가짜 응답, 함수 분류 목록.
