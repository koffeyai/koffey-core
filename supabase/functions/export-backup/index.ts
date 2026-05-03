// Supabase Edge Function: export-backup
// Generates a ZIP archive of CRM data for the authenticated user's organizations

import JSZip from "https://esm.sh/jszip@3.10.1";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Determine tables to export
    const { tables } = await req.json().catch(() => ({ tables: [
      "contacts", "deals", "activities", "tasks", "accounts",
    ] }));

    // Fetch user org ids via RPC (RLS-safe)
    const { data: orgIds, error: orgErr } = await supabase.rpc("get_user_organization_ids");
    if (orgErr) throw orgErr;
    const organizations: string[] = (orgIds as any[]) || [];
    if (!organizations.length) {
      return new Response(JSON.stringify({ error: "No organizations found for user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = new JSZip();

    // Metadata
    zip.file("meta.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      org_count: organizations.length,
      tables,
      version: 1,
    }, null, 2));

    // Export each table as JSON
    for (const table of tables as string[]) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .in("organization_id", organizations);
        if (error) throw error;
        zip.file(`${table}.json`, JSON.stringify(data ?? [], null, 2));
      } catch (e) {
        // Include error file for visibility without failing whole export
        zip.file(`${table}__error.txt`, String(e?.message ?? e));
      }
    }

    const content: Uint8Array = await zip.generateAsync({ type: "uint8array" });
    const filename = `crm-backup-${new Date().toISOString().replace(/[:TZ]/g, "-").slice(0, 19)}.zip`;

    return new Response(content, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "Export failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
