/**
 * correction-config.js
 * AI 첨삭(FEEDBACK) 전역 설정
 */

window.CORRECTION_CONFIG = {
    writingWebhookDraft1:  'https://eontoefl.app.n8n.cloud/webhook/correction-writing-draft1',
    writingWebhookDraft2:  'https://eontoefl.app.n8n.cloud/webhook/correction-writing-draft2',
    speakingWebhookDraft1: 'https://eontoefl.app.n8n.cloud/webhook/correction-speaking-draft1',
    speakingWebhookDraft2: 'https://eontoefl.app.n8n.cloud/webhook/correction-speaking-draft2',

    // ── Webhook 실패 시 텔레그램 알림 설정 ──
    telegramAlertRpcName: 'send_telegram_alert',   // Supabase RPC 함수명
    telegramAlertSecret: 'nevelup-correction-alert-2026',
    telegramAlertCooldownMs: 5 * 60 * 1000  // 동일 webhook URL 기준 5분 쿨다운
};

console.log('✅ correction-config.js 로드 완료');
