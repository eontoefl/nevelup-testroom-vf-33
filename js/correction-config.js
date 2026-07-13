/**
 * correction-config.js
 * AI 첨삭(FEEDBACK) 전역 설정
 */

window.CORRECTION_CONFIG = {
    writingWebhookDraft1:  'https://eontoefl.app.n8n.cloud/webhook/correction-writing-draft1',
    writingWebhookDraft2:  'https://eontoefl.app.n8n.cloud/webhook/correction-writing-draft2',
    speakingWebhookDraft1: 'https://eontoefl.app.n8n.cloud/webhook/correction-speaking-draft1',
    speakingWebhookDraft2: 'https://eontoefl.app.n8n.cloud/webhook/correction-speaking-draft2',

    // ── 호주첨삭 전용 워크플로우 (일반과 주소 자체가 분리 — 절대 섞이지 않음) ──
    ausWritingWebhookDraft1:  'https://eontoefl.app.n8n.cloud/webhook/correction-aus-writing-draft1',
    ausWritingWebhookDraft2:  'https://eontoefl.app.n8n.cloud/webhook/correction-aus-writing-draft2',
    ausSpeakingWebhookDraft1: 'https://eontoefl.app.n8n.cloud/webhook/correction-aus-speaking-draft1',
    ausSpeakingWebhookDraft2: 'https://eontoefl.app.n8n.cloud/webhook/correction-aus-speaking-draft2',

    // ── 호주첨삭 유형별 개통 스위치 ──
    // 워크플로우와 프롬프트가 "둘 다" 준비된 유형만 true.
    // false면 제출은 정상 저장되고 webhook만 보내지 않는다 (첨삭은 나중에 소급 처리).
    // 준비 안 된 유형을 열면 TODO 프롬프트로 엉터리 첨삭이 학생에게 생성된다.
    ausWebhookReady: {
        writing_aus_discussion:   { draft1: true, draft2: true },  // 토라 — 일반 Discussion 프롬프트 재사용
        writing_aus_integrated:   { draft1: true, draft2: true },  // 통라
        speaking_aus_independent: { draft1: true, draft2: true },  // 독스
        speaking_aus_int2:        { draft1: true, draft2: true },  // 통스2
        speaking_aus_int3:        { draft1: true, draft2: true },  // 통스3
        speaking_aus_int4:        { draft1: true, draft2: true }   // 통스4
    },

    // ── Webhook 실패 시 텔레그램 알림 설정 ──
    telegramAlertRpcName: 'send_telegram_alert',   // Supabase RPC 함수명
    telegramAlertSecret: 'nevelup-correction-alert-2026',
    telegramAlertCooldownMs: 5 * 60 * 1000  // 동일 webhook URL 기준 5분 쿨다운
};

console.log('✅ correction-config.js 로드 완료');
