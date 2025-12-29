import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-device-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
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
    const contentType = req.headers.get("content-type") || "";
    let audioData: Uint8Array;
    let transcript: string | null = null;
    let mimeType = "audio/mpeg";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      transcript = formData.get("transcript") as string | null;

      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      audioData = new Uint8Array(await file.arrayBuffer());
      mimeType = file.type || "audio/mpeg";
    } else {
      return new Response(JSON.stringify({ error: "Content-Type must be multipart/form-data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audioData.length === 0) {
      return new Response(JSON.stringify({ error: "Empty file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate file path for AI response
    const timestamp = Date.now();
    const extension = mimeType.includes("mp3") ? "mp3" : mimeType.includes("webm") ? "webm" : "mp3";
    const filePath = `ai/${userId}/${timestamp}_response.${extension}`;

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(filePath, audioData, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload file", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create AI recording entry
    const { data: recording, error: dbError } = await supabase
      .from("recordings")
      .insert({
        file_path: filePath,
        sender: "ai",
        status: "pending",
        user_id: userId,
        transcript: transcript,
        played: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Clean up uploaded file
      await supabase.storage.from("recordings").remove([filePath]);
      return new Response(JSON.stringify({ error: "Failed to create record", details: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        recording: {
          id: recording.id,
          file_path: recording.file_path,
          status: recording.status,
          created_at: recording.created_at,
        },
      }),
      {
        status: 201,
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
