// [실험 3D-0 ③] 안마다 시험 서버가 내주는 사본을 바꾼다. 저장소의 제품 파일(index.html·mypage.html·js/*)은 고치지 않는다.
//   base  : 3B 그대로(스위치 둘만 켠 사본) — 견줄 기준
//   frame : (가) 살아 있는 문서 — 첫 화면에 frame-host.js, 마이페이지 head 맨 앞에 frame-child.js, 같은 출처의 iframe 을 허용
//   multi : (나) 여러 문서 이동 — 마이페이지도 화면 머리의 스위치 + 인증 모듈 + multi-glue.js 를 싣고, 모듈은 넓힌 규칙의 사본
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchModuleForMulti } from './multi-module.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(HERE, name), 'utf8').replace(/\r\n/g, '\n');
export const VARIANTS = ['base', 'frame', 'multi'];

function once(text, from, to, what) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`실험 사본: 끼울 자리를 정확히 1곳 찾지 못함(${n}곳) — ${what}`);
    return text.replace(from, () => to);
}
const inline = (id, code) => `<script id="${id}">\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
// 마이페이지에 둘 "화면 머리의 스위치"(첫 화면의 것과 같은 구실 — 이 화면도 켜진 화면임을 모듈 파일과 독립으로 안다)
const PAGE_SWITCH = "(function () { try { Object.defineProperty(window, 'TR_AUTH_PAGE', { value: 'on', writable: false, configurable: false }); } catch (e) { window.TR_AUTH_PAGE = 'on'; } window.TR_KEEP_USER = true; })();";

// 돌려주는 값: (경로, 이미 스위치·설정이 바뀐 본문 Buffer) → 본문 Buffer
export function makeTransform(variant) {
    if (!VARIANTS.includes(variant)) throw new Error('안의 이름이 맞지 않음');
    return function transform(pathname, body) {
        if (variant === 'frame') {
            if (pathname === '/index.html' || pathname === '/') {
                return Buffer.from(once(body.toString('utf8'), '</body>', inline('exp-3d0-frame-host', read('frame-host.js')) + '</body>', '첫 화면의 끝'), 'utf8');
            }
            if (pathname === '/mypage.html') {
                return Buffer.from(once(body.toString('utf8'), '<head>', '<head>\n' + inline('exp-3d0-frame-child', read('frame-child.js')), '마이페이지의 head'), 'utf8');
            }
        }
        if (variant === 'multi') {
            if (pathname === '/js/auth-session.js') return Buffer.from(patchModuleForMulti(body.toString('utf8')), 'utf8');
            if (pathname === '/mypage.html') {
                const head = '<head>\n' + inline('exp-3d0-page-switch', PAGE_SWITCH) + '<script src="js/auth-session.js?v=exp3d0"></script>\n' + inline('exp-3d0-multi-glue', read('multi-glue.js'));
                return Buffer.from(once(body.toString('utf8'), '<head>', head, '마이페이지의 head'), 'utf8');
            }
        }
        return body;
    };
}
// (가)는 같은 출처의 iframe 을 쓴다 — 시험 서버의 내용 보안 정책에서 그것만 허용한다
export function headersFor(variant, headers) {
    if (variant !== 'frame') return headers;
    const out = Object.assign({}, headers);
    for (const k of Object.keys(out)) if (k.toLowerCase() === 'content-security-policy') out[k] = String(out[k]).replace("frame-src 'none'", "frame-src 'self'");
    return out;
}
