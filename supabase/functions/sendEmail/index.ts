/**
 * PDD: Edge Function slug `sendEmail` (parasti šis ir deployots projektā).
 * POST JSON { name, veids, type?: "cits" } vai IaD { type: "iad_*", to, subject, text, html, cc } → Resend.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "PDD <prombutnes@vid.gov.lv>";

const DEFAULT_APPROVAL_URL =
  "https://irinakupcova.github.io/PDD_aplikacija/prombutnes-vesture";
const DEFAULT_TO = "katrina.jirgensone@vid.gov.lv";
const DEFAULT_CC = "irina.kupcova@vid.gov.lv";

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

function parseEmailList(raw: string | undefined | null, fallback: string): string[] {
  const src = String(raw ?? "").trim() || fallback;
  return src
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** RESEND_TO var būt vairākas adreses: ar `; ` vai `,` (ar vai bez atstarpes). */
function parseToRecipients(raw: string | undefined | null, fallbackSingle: string): string[] {
  const s = sanitizeHeaderValue(raw);
  if (!s) return [fallbackSingle];
  const parts = s
    .split(/[,;]+/)
    .map((x) => sanitizeHeaderValue(x))
    .filter((x) => x.length > 0);
  return parts.length > 0 ? parts : [fallbackSingle];
}

type RequestBody = {
  name?: unknown;
  veids?: unknown;
  type?: unknown;
  subject?: unknown;
  url?: unknown;
  to?: unknown;
  text?: unknown;
  html?: unknown;
  cc?: unknown;
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

function normalizeBody(input: RequestBody): { name: string; veids: string } {
  return {
    name: String(input?.name ?? "").trim(),
    veids: String(input?.veids ?? "").trim(),
  };
}

function isCitsPayload(raw: RequestBody, veids: string): boolean {
  const t = String(raw?.type ?? "").trim().toLowerCase();
  if (t === "cits") return true;
  const v = veids.trim().toLowerCase();
  if (v === "cits") return true;
  const n = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("cits") && n.includes("saskan")) return true;
  return false;
}

function isIadInformeshanaPayload(raw: RequestBody): boolean {
  const t = String(raw?.type ?? "").trim().toLowerCase();
  return (
    t === "iad_atgadinajums" ||
    t === "iad_informesana" ||
    t === "iad_welcome" ||
    t === "iad_reminder"
  );
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

async function sendViaResend(
  resendApiKey: string,
  emailBody: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; parsed: unknown }> {
  const resendResp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  const raw = await resendResp.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  return { ok: resendResp.ok, status: resendResp.status, parsed };
}

function resendErrorText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  return String((parsed as { message?: string }).message ?? "").trim();
}

function isResendFromOrDomainError(parsed: unknown): boolean {
  const m = resendErrorText(parsed).toLowerCase();
  return (
    m.includes("domain is not verified") ||
    m.includes("only send testing emails") ||
    m.includes("not verified")
  );
}

async function sendViaResendDirect(
  resendApiKey: string,
  emailBody: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; parsed: unknown }> {
  let sent = await sendViaResend(resendApiKey, emailBody);
  if (sent.ok || !emailBody.cc) return sent;
  if (isResendFromOrDomainError(sent.parsed)) {
    const retryBody: Record<string, unknown> = { ...emailBody };
    delete retryBody.cc;
    const retry = await sendViaResend(resendApiKey, retryBody);
    if (retry.ok) return retry;
    sent = retry;
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const resendApiKey = readResendApiKey();
  if (!resendApiKey) return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);

  const from = sanitizeHeaderValue(Deno.env.get("RESEND_FROM")) || DEFAULT_FROM;
  const toList = parseToRecipients(Deno.env.get("RESEND_TO"), DEFAULT_TO);
  const ccList = parseEmailList(Deno.env.get("RESEND_CC"), DEFAULT_CC);
  const allowCc = true;

  let rawBody: RequestBody;
  try {
    rawBody = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (isIadInformeshanaPayload(rawBody)) {
    const toAddr = sanitizeHeaderValue(rawBody?.to);
    if (!toAddr || !toAddr.includes("@")) {
      return jsonResponse({ error: "to is required for IaD informēšana" }, 400);
    }

    const subject =
      String(rawBody?.subject ?? "").trim() || "PDD: IaD informēšana";
    const htmlRaw = String(rawBody?.html ?? "").trim();
    const textRaw = String(rawBody?.text ?? "").trim();
    const urlRaw = String(rawBody?.url ?? "").trim();
    const html =
      htmlRaw ||
      `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#0f172a"><p>${escapeHtml(
        textRaw || String(rawBody?.name ?? ""),
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
    if (allowCc && bodyCc.length > 0) {
      emailBody.cc = bodyCc;
    }

    try {
      const sent = await sendViaResendDirect(resendApiKey, emailBody);
      if (!sent.ok) {
        const hint = isResendFromOrDomainError(sent.parsed)
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
  }

  const { name, veids } = normalizeBody(rawBody);
  if (!name || !veids) {
    return jsonResponse({ error: "name and veids are required" }, 400);
  }

  if (!isCitsPayload(rawBody, veids)) {
    return jsonResponse(
      { success: true, skipped: true, reason: "not_cits" },
      200,
    );
  }

  const subjectRaw = String(rawBody?.subject ?? "").trim();
  const subject = subjectRaw || "Lūdzu apstiprināt prombūtni";
  const urlRaw = String(rawBody?.url ?? "").trim();
  const approvalUrl = urlRaw || Deno.env.get("APPROVAL_URL")?.trim() || DEFAULT_APPROVAL_URL;

  const html = `<!doctype html>
<html>
  <body>
    <p>Vārds: ${escapeHtml(name)}</p>
    <p>Veids: ${escapeHtml(veids)}</p>
    <p>Apstipriniet prombūtni:</p>
    <p><a href="${escapeHtml(approvalUrl)}" target="_blank" rel="noopener">Apstiprināt prombūtni</a></p>
  </body>
</html>`;

  try {
    const emailBody: Record<string, unknown> = {
      from,
      to: toList,
      subject,
      html,
    };
    if (allowCc && ccList.length > 0) {
      emailBody.cc = ccList;
    }

    const sent = await sendViaResendDirect(resendApiKey, emailBody);
    if (!sent.ok) {
      const hint = isResendFromOrDomainError(sent.parsed)
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
    const debug = {
      from,
      toList,
      allowCc,
      ccCount: ccList.length,
      hasResendApiKey: Boolean(resendApiKey),
      resendApiKeyPrefix: resendApiKey.slice(0, 12),
      resendApiKeyLength: resendApiKey.length,
    };
    console.error("[sendEmail unexpected]", {
      message: errMsg,
      ...debug,
    });
    return jsonResponse(
      {
        error: "Unexpected server error",
        details: errMsg,
        debug,
      },
      500,
    );
  }
});
