// Deno uz Supabase Edge Functions. Nosūta e-pastu ar saiti uz lapu (tokens).
// Secrets: RESEND_API_KEY, RESEND_FROM (piem. "PDD <prombutnes@jusu-domena.lv>")
// Supabase automātiski pievieno SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { request_id, app_base_url } = await req.json();
    if (!request_id || typeof app_base_url !== "string") {
      return new Response(JSON.stringify({ error: "Trūkst request_id vai app_base_url" }), {
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
    const { data: row, error: rowErr } = await admin
      .from("pdd_cits_requests")
      .select("id, user_id, start_date, end_date, comment, notify_email, approval_token, status")
      .eq("id", request_id)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Pieteikums nav atrasts" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (row.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Pieeja liegta" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (row.status !== "pending_manager") {
      return new Response(JSON.stringify({ error: "Jau apstrādāts" }), {
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
    const employee =
      String(p?.["Vārds uzvārds"] ?? p?.full_name ?? userData.user.email ?? row.user_id).trim() || row.user_id;

    const base = app_base_url.replace(/\/$/, "");
    const sep = base.includes("?") ? "&" : "?";
    const link = `${base}${sep}cits=${row.approval_token}`;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") ?? "PDD <onboarding@resend.dev>";

    if (!resendKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          message:
            "RESEND_API_KEY nav iestatīts Edge Function — e-pasts netika nosūtīts. Saite: " + link,
          link,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = `
      <p>Sveiki,</p>
      <p><strong>${employee}</strong> pieprasa prombūtni ar veidu <strong>Cits (ar vadītāja saskaņojumu)</strong>.</p>
      <p>Periods: <strong>${row.start_date}</strong> — <strong>${row.end_date}</strong></p>
      ${row.comment ? `<p>Komentārs: ${String(row.comment).replace(/</g, "&lt;")}</p>` : ""}
      <p><a href="${link}">Atvērt apstiprināšanu PDD lapā</a></p>
      <p>Ja saite nedarbojas, ielīmē pārlūkā:<br/><code>${link}</code></p>
    `;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [row.notify_email],
        subject: `PDD: Cits (ar vadītāja saskaņojumu) — ${employee} (${row.start_date}–${row.end_date})`,
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

    return new Response(JSON.stringify({ ok: true, link }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
