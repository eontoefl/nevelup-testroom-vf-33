/**
 * send-telegram-alert
 * Supabase Edge Function — Telegram Bot API proxy
 *
 * 역할: webhook 실패 시 관리자에게 텔레그램 알림을 전송합니다.
 * 봇 토큰을 클라이언트에 노출하지 않기 위해 Edge Function을 프록시로 사용합니다.
 *
 * 환경변수 (Supabase Dashboard → Edge Functions → Secrets):
 *   TELEGRAM_BOT_TOKEN  — 텔레그램 봇 토큰 (n8n Telegram credential에서 확인)
 *   TELEGRAM_CHAT_ID    — 관리자 채팅 ID (1753336274)
 *   ALERT_SECRET        — 호출 시 x-alert-secret 헤더로 검증할 시크릿 값
 *
 * 호출 예시:
 *   POST /functions/v1/send-telegram-alert
 *   Headers: { Authorization: Bearer {SUPABASE_ANON_KEY}, x-alert-secret: {ALERT_SECRET}, Content-Type: application/json }
 *   Body: { "message": "🚨 webhook 실패\n학생: 홍길동\n과제: Writing Email 1차" }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-alert-secret, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // POST만 허용
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // x-alert-secret 검증
  const alertSecret = Deno.env.get("ALERT_SECRET");
  const requestSecret = req.headers.get("x-alert-secret");

  if (!alertSecret || requestSecret !== alertSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 환경변수 확인
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken || !chatId) {
    return new Response(
      JSON.stringify({ error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Body에서 message 추출
  let message: string;
  try {
    const body = await req.json();
    message = body.message;
    if (!message || typeof message !== "string") {
      throw new Error("message is required");
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Invalid body: message (string) is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Telegram Bot API 호출
  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const telegramRes = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const telegramData = await telegramRes.json();

    if (!telegramRes.ok) {
      console.error("Telegram API error:", telegramData);
      return new Response(
        JSON.stringify({ ok: false, error: "Telegram API error", detail: telegramData }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message_id: telegramData.result?.message_id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Telegram request failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to send telegram message" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
