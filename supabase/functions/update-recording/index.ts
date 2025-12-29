import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-device-token, content-type",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Authentication: x-device-token
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
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const allowedFields = ["status", "transcript", "played"];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: "No valid fields to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update recording (only if it belongs to this user)
    const { data: recording, error: dbError } = await supabase
      .from("recordings")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(JSON.stringify({ error: "Failed to update recording" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recording) {
      return new Response(JSON.stringify({ error: "Recording not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ recording }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
