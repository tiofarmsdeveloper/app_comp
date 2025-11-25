// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function urlToGenerativePart(url: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const base64Encoded = encode(new Uint8Array(arrayBuffer));
  return {
    inlineData: { data: base64Encoded, mimeType },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { screenshot_ids } = await req.json();
    if (!screenshot_ids || !Array.isArray(screenshot_ids) || screenshot_ids.length === 0) {
      return new Response(JSON.stringify({ error: "screenshot_ids must be a non-empty array." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing API key.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    for (const screenshot_id of screenshot_ids) {
      const { data: screenshot, error: ssError } = await supabase
        .from('competitor_screenshots')
        .select('id, image_path')
        .eq('id', screenshot_id)
        .single();

      if (ssError || !screenshot) {
        console.error(`Could not find or fetch screenshot ${screenshot_id}:`, ssError?.message);
        continue; // Skip to the next screenshot if this one fails
      }

      const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(screenshot.image_path);
      const imagePart = await urlToGenerativePart(publicUrl, 'image/png');

      const prompt = `
        You are a UX Analyst. For the provided fintech app screenshot, generate a concise, descriptive title (3-5 words) that identifies the main action or information shown.
        Provide only the title as plain text, without quotes or any other formatting.
      `;

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const title = response.text().trim().replace(/["']/g, "");

      await supabase
        .from('competitor_screenshots')
        .update({ ai_title: title })
        .eq('id', screenshot.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in generate-competitor-details function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});