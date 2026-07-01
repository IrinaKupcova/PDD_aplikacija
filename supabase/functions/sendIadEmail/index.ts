/**
 * PDD: IaD informēšanas e-pasti (atbildīgo/līdzatbildīgo pievienošana, mēneša atgādinājumi).
 * POST JSON: { to, subject, text?, html?, url?, cc? }
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "PDD <prombutnes@vid.gov.lv>";

function sanitizeHeaderValue(v: unknown): string {
  const s = String(v ?? "").replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 255 || c === 127 || (c < 32 && c !== 9)) continue;
    out += s[i];
  }
  return out.trim();
}

type RequestBody = {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  url?: unknown;
  cc?: unknown;
  type?: unknown;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readResendApiKey(): string {
  let k = sanitizeHeaderValue(Deno.env.get("RESEND_API_KEY"));
  if (k.startsWith("re_")) return k;
  k = k.replace(/^["']+|["']+$/g, "").trim();
  return sanitizeHeaderValue(k);
}

function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCcFromRequest(raw: RequestBody): string[] {
  const cc = raw?.cc;
  if (Array.isArray(cc)) {
    return cc
      .map((x) => sanitizeHeaderValue(x))
      .filter((x) => x.includes("@") && x.includes("."));
  }
  const s = String(cc ?? "").trim();
  if (!s) return [];
  return s
    .split(/[,;]+/)
    .map((x) => sanitizeHeaderValue(x))
    .filter((x) => x.includes("@") && x.includes("."));
}

function resendErrorText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  return String((parsed as { message?: string }).message ?? "").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const resendApiKey = readResendApiKey();
  if (!resendApiKey) return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);

  const from = sanitizeHeaderValue(Deno.env.get("RESEND_FROM")) || DEFAULT_FROM;

  let rawBody: RequestBody;
  try {
    rawBody = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const toAddr = sanitizeHeaderValue(rawBody?.to);
  if (!toAddr || !toAddr.includes("@")) {
    return jsonResponse({ error: "to is required" }, 400);
  }

  const subject = String(rawBody?.subject ?? "").trim() || "PDD: IaD informēšana";
  const htmlRaw = String(rawBody?.html ?? "").trim();
  const textRaw = String(rawBody?.text ?? "").trim();
  const urlRaw = String(rawBody?.url ?? "").trim();
  const html =
    htmlRaw ||
    `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#0f172a"><p>${escapeHtml(
      textRaw,
    )}</p>${
      urlRaw
        ? `<p><a href="${escapeHtml(urlRaw)}" target="_blank" rel="noopener">Atvērt aplikācijā</a></p>`
        : ""
    }</body></html>`;

  const emailBody: Record<string, unknown> = {
    from,
    to: [toAddr],
    subject,
    html,
  };
  if (textRaw) emailBody.text = textRaw;

  const bodyCc = parseCcFromRequest(rawBody).filter(
    (em) => em.toLowerCase() !== toAddr.toLowerCase(),
  );
  if (bodyCc.length > 0) emailBody.cc = bodyCc;

  try {
    const sendOnce = async (body: Record<string, unknown>) => {
      const resendResp = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await resendResp.text();
      let parsed: unknown = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = raw;
      }
      return { ok: resendResp.ok, status: resendResp.status, parsed };
    };

    let sent = await sendOnce(emailBody);
    if (!sent.ok && emailBody.cc) {
      const errLo = resendErrorText(sent.parsed).toLowerCase();
      if (errLo.includes("domain") || errLo.includes("verified") || errLo.includes("only send")) {
        const retryBody: Record<string, unknown> = { ...emailBody };
        delete retryBody.cc;
        const retry = await sendOnce(retryBody);
        if (retry.ok) sent = retry;
        else sent = retry;
      }
    }

    if (!sent.ok) {
      const errLo = resendErrorText(sent.parsed).toLowerCase();
      const hint = errLo.includes("domain") || errLo.includes("verified") || errLo.includes("only send")
        ? "Verificē domēnu vid.gov.lv Resend un iestati RESEND_FROM = PDD <prombutnes@vid.gov.lv>."
        : undefined;
      return jsonResponse(
        {
          error: "Resend request failed",
          status: sent.status,
          details: sent.parsed,
          ...(hint ? { resend_hint: hint } : {}),
        },
        502,
      );
    }

    return jsonResponse(
      {
        success: true,
        ok: true,
        provider: "resend",
        result: sent.parsed,
      },
      200,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: "Unexpected server error", details: errMsg }, 500);
  }
});
