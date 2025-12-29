import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-device-token, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Authentication: x-device-token only
  const deviceToken = req.headers.get("x-device-token");

  if (!deviceToken) {
    return new Response(JSON.stringify({ error: "Missing x-device-token header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tokenData, error: tokenError } = await supabase
    .from("device_tokens")
    .select("user_id, expires_at")
    .eq("token", deviceToken)
    .single();

  if (tokenError || !tokenData) {
    return new Response(JSON.stringify({ error: "Invalid device token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (new Date(tokenData.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "Device token expired" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = tokenData.user_id;

  try {
    const url = new URL(req.url);
    const sender = url.searchParams.get("sender"); // 'user' | 'ai' | null (all)
    const played = url.searchParams.get("played"); // 'true' | 'false' | null (all)
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = supabase
      .from("recordings")
      .select("id, file_path, duration, sender, status, transcript, played, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (sender) {
      query = query.eq("sender", sender);
    }

    if (played !== null) {
      query = query.eq("played", played === "true");
    }

    const { data: recordings, error, count } = await query;

    if (error) {
      console.error("Database error:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch recordings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        recordings,
        total: count,
        limit,
        offset,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
