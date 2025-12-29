import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-device-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Initialize Supabase client (service role for admin operations)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Authentication: x-device-token only
  const deviceToken = req.headers.get("x-device-token");

  if (!deviceToken) {
    return new Response(JSON.stringify({ error: "Missing x-device-token header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tokenData, error: tokenError } = await supabaseAdmin
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

  // Get user's GitHub token from database
  let githubToken: string | null = null;
  const { data: ghToken } = await supabaseAdmin
    .from("github_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .single();

  if (ghToken) {
    githubToken = ghToken.access_token;
  }

  try {
    // Get audio file from request
    const contentType = req.headers.get("content-type") || "";
    let audioData: Uint8Array;
    let filename: string;
    let mimeType: string;

    if (contentType.includes("multipart/form-data")) {
      // Handle multipart form data
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      audioData = new Uint8Array(await file.arrayBuffer());
      filename = file.name || `recording_${Date.now()}.mp3`;
      mimeType = file.type || "audio/mpeg";
    } else {
      // Handle raw binary data
      audioData = new Uint8Array(await req.arrayBuffer());
      filename = `recording_${Date.now()}.mp3`;
      mimeType = contentType || "audio/mpeg";
    }

    if (audioData.length === 0) {
      return new Response(JSON.stringify({ error: "Empty file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique file path
    const timestamp = Date.now();
    const filePath = `user/${userId}/${timestamp}_${filename}`;

    // Upload to Storage
    const { error: uploadError } = await supabaseAdmin.storage
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

    // Insert record into database
    const { data: recording, error: dbError } = await supabaseAdmin
      .from("recordings")
      .insert({
        file_path: filePath,
        sender: "user",
        status: "pending",
        user_id: userId,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Try to clean up uploaded file
      await supabaseAdmin.storage.from("recordings").remove([filePath]);
      return new Response(JSON.stringify({ error: "Failed to create record", details: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger GitHub Actions workflow using the user's linked GitHub token
    if (githubToken) {
      try {
        const workflowResponse = await fetch(
          "https://api.github.com/repos/e7h4n/vm0-alfred/actions/workflows/on-voice.yaml/dispatches",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github.v3+json",
              "Content-Type": "application/json",
              "User-Agent": "supabase-edge-function",
            },
            body: JSON.stringify({
              ref: "main",
              inputs: {
                recording_id: recording.id,
              },
            }),
          }
        );

        if (!workflowResponse.ok) {
          console.error("Failed to trigger workflow:", await workflowResponse.text());
        }
      } catch (workflowError) {
        console.error("Error triggering workflow:", workflowError);
      }
    }

    // Return success response
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
