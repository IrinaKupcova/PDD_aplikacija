// Pēc „Cits (ar vadītāja saskaņojumu)” apstiprināšanas — e-pasts pieteicējam (public.users.email).
// Secrets: RESEND_API_KEY, RESEND_FROM (kā notify-cits-manager)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function callerCanApprove(admin: any, authUid: string): Promise<boolean> {
  const { data: u } = await admin.from("users").select("role").eq("id", authUid).maybeSingle();
  if (u?.role === "manager" || u?.role === "admin") return true;
  const { data: d } = await admin
    .from("pdd_deputy_state")
    .select("deputy_user_id, deputy_valid_from, deputy_valid_to")
    .eq("id", 1)
    .maybeSingle();
  if (!d?.deputy_user_id || d.deputy_user_id !== authUid) return false;
  const t = todayIsoDate();
  if (d.deputy_valid_from && t < String(d.deputy_valid_from)) return false;
  if (d.deputy_valid_to && t > String(d.deputy_valid_to)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nav autorizācijas" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { p_token } = await req.json();
    if (!p_token || typeof p_token !== "string") {
      return new Response(JSON.stringify({ error: "Trūkst p_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Nederīgs lietotājs" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    if (!(await callerCanApprove(admin, userData.user.id))) {
      return new Response(JSON.stringify({ error: "Tikai vadītājs vai apstiprinātājs drīkst sūtīt šo paziņojumu" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await admin
      .from("pdd_cits_requests")
      .select("id, user_id, start_date, end_date, comment, status")
      .eq("approval_token", p_token)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Pieteikums nav atrasts" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (row.status !== "approved") {
      return new Response(JSON.stringify({ error: "Pieteikums vēl nav apstiprināts" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prof } = await admin
      .from("users")
      .select('full_name, email, "i-mail", "Vārds uzvārds"')
      .eq("id", row.user_id)
      .maybeSingle();

    const p = prof as Record<string, unknown> | null;
    const toEmail = String(p?.email ?? p?.["i-mail"] ?? "")
      .trim();
    if (!toEmail || !toEmail.includes("@")) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, message: "Pieteicējam nav e-pasta (email vai i-mail)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const employee = String(p?.["Vārds uzvārds"] ?? p?.full_name ?? toEmail).trim() || toEmail;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") ?? "PDD <onboarding@resend.dev>";

    if (!resendKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          message: "RESEND_API_KEY nav iestatīts — pieteicējam netika nosūtīts e-pasts.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = `
      <p>Sveiki, <strong>${employee}</strong>,</p>
      <p>Jūsu prombūtnes pieprasījums ar veidu <strong>Cits (ar vadītāja saskaņojumu)</strong> ir <strong>apstiprināts</strong>.</p>
      <p>Periods: <strong>${row.start_date}</strong> — <strong>${row.end_date}</strong></p>
      ${row.comment ? `<p>Komentārs: ${String(row.comment).replace(/</g, "&lt;")}</p>` : ""}
      <p>Ar cieņu,<br/>PDD</p>
    `;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: `PDD: apstiprināts — Cits (ar vadītāja saskaņojumu) (${row.start_date}–${row.end_date})`,
        html,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Resend: " + t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
