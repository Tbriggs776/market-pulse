import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { fiscalYear } = await req.json().catch(() => ({}))
    const fy = fiscalYear || 2026

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    )

    const { data, error } = await supabase
      .from("budget_baselines")
      .select("category_type, category_name, display_order, projected_amount, source, published_date, notes")
      .eq("fiscal_year", fy)
      .order("category_type", { ascending: false })
      .order("display_order", { ascending: true })

    if (error) throw error

    const rows = data || []
    const receipts = rows.filter((r) => r.category_type === "receipt")
    const outlays = rows.filter((r) => r.category_type === "outlay")
    const totalReceipts = receipts.reduce((s, r) => s + Number(r.projected_amount), 0)
    const totalOutlays = outlays.reduce((s, r) => s + Number(r.projected_amount), 0)

    return new Response(
      JSON.stringify({
        fiscalYear: fy,
        source: rows[0]?.source || "CBO",
        publishedDate: rows[0]?.published_date || null,
        receipts,
        outlays,
        totalReceipts,
        totalOutlays,
        projectedDeficit: totalOutlays - totalReceipts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})