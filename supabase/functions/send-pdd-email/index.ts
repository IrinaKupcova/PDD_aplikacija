const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const DEFAULT_APPROVAL_URL =
  "https://irinakupcova.github.io/PDD_aplikacija/prombutnes-vesture";
const DEFAULT_TO = "katrina.jirgensone@vid.gov.lv";
const DEFAULT_CC = "irina.kupcova@vid.gov.lv,pliada@inbox.lv";

function parseEmailList(raw: string | undefined | null, fallback: string): string[] {
  const src = String(raw ?? "").trim() || fallback;
  return src
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

type RequestBody = {
  name?: unknown;
  veids?: unknown;
  type?: unknown;
  subject?: unknown;
  url?: unknown;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);

  const from =
    Deno.env.get("RESEND_FROM")?.trim() ||
    "PDD <irina.kupcova@vid.gov.lv>";
  const toPrimary = Deno.env.get("RESEND_TO")?.trim() || DEFAULT_TO;
  const ccList = parseEmailList(Deno.env.get("RESEND_CC"), DEFAULT_CC);

  let rawBody: RequestBody;
  try {
    rawBody = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
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
    const resendResp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [toPrimary],
        cc: ccList,
        subject,
        html,
      }),
    });

    const raw = await resendResp.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }

    if (!resendResp.ok) {
      return jsonResponse(
        {
          error: "Resend request failed",
          status: resendResp.status,
          details: parsed,
        },
        502,
      );
    }

    return jsonResponse({ success: true, provider: "resend", result: parsed }, 200);
  } catch (err) {
    return jsonResponse(
      {
        error: "Unexpected server error",
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
