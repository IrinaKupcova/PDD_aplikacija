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
const FALLBACK_FROM = "PDD <onboarding@resend.dev>";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const resendApiKey = readResendApiKey();
  if (!resendApiKey) return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);

  const from =
    sanitizeHeaderValue(Deno.env.get("RESEND_FROM")) ||
    "PDD <onboarding@resend.dev>";
  const allowCc = !from.toLowerCase().includes("@resend.dev");

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
  if (allowCc && bodyCc.length > 0) emailBody.cc = bodyCc;

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
    let usedFallbackFrom = false;
    let usedTestRelay = false;
    const errMsg = String((sent.parsed as { message?: string })?.message ?? "").toLowerCase();
    const domainUnverified =
      !sent.ok && (errMsg.includes("domain is not verified") || errMsg.includes("not verified"));
    if (domainUnverified && !from.toLowerCase().includes("@resend.dev")) {
      const retryBody: Record<string, unknown> = { ...emailBody, from: FALLBACK_FROM };
      delete retryBody.cc;
      const retry = await sendOnce(retryBody);
      if (retry.ok) {
        usedFallbackFrom = true;
        sent = retry;
      } else {
        sent = retry;
      }
    }

    if (!sent.ok && String((sent.parsed as { message?: string })?.message ?? "").toLowerCase().includes("only send testing emails")) {
      const hit = String((sent.parsed as { message?: string })?.message ?? "").match(
        /your own email address \(([^)]+)\)/i,
      );
      const testTo = sanitizeHeaderValue(
        hit?.[1] || Deno.env.get("RESEND_TEST_TO") || Deno.env.get("RESEND_ACCOUNT_EMAIL") || "",
      );
      if (testTo) {
        const origTo = emailBody.to;
        const origCc = emailBody.cc;
        const notice = `<p style="background:#fef3c7;padding:10px;border-radius:8px;"><strong>PDD (Resend testa režīms):</strong> Novirzīts uz ${escapeHtml(
          testTo,
        )}. Plānotie TO: ${escapeHtml(JSON.stringify(origTo))}; CC: ${escapeHtml(
          JSON.stringify(origCc ?? []),
        )}</p>`;
        const relay = await sendOnce({
          from: FALLBACK_FROM,
          to: [testTo],
          subject: `[PDD] ${subject}`,
          html: notice + html,
          ...(textRaw ? { text: textRaw } : {}),
        });
        if (relay.ok) {
          usedFallbackFrom = true;
          usedTestRelay = true;
          sent = relay;
        } else {
          sent = relay;
        }
      }
    }

    if (!sent.ok) {
      return jsonResponse(
        { error: "Resend request failed", status: sent.status, details: sent.parsed },
        502,
      );
    }

    return jsonResponse(
      {
        success: true,
        ok: true,
        provider: "resend",
        result: sent.parsed,
        ...(usedFallbackFrom
          ? {
              usedFallbackFrom: true,
              hint: usedTestRelay
                ? "Resend testa režīms — vēstule nosūtīta uz Resend konta e-pastu."
                : "RESEND_FROM domēns nav verificēts Resend — pagaidām sūtīts no onboarding@resend.dev",
            }
          : {}),
        ...(usedTestRelay ? { usedTestRelay: true } : {}),
      },
      200,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: "Unexpected server error", details: errMsg }, 500);
  }
});
