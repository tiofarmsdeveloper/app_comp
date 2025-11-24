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
    const { competitor_id, screenshot_ids } = await req.json();
    if (!competitor_id || !screenshot_ids || screenshot_ids.length === 0) {
      throw new Error("competitor_id and at least one screenshot_id are required.");
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role key for admin access
    );

    // Fetch screenshot paths from DB
    const { data: screenshots, error: ssError } = await supabase
      .from('competitor_screenshots')
      .select('id, image_path')
      .in('id', screenshot_ids);

    if (ssError) throw ssError;
    if (!screenshots || screenshots.length === 0) {
      throw new Error("No matching screenshots found in the database.");
    }

    const imageParts = await Promise.all(
      screenshots.map(ss => {
        const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(ss.image_path);
        // Assuming PNG, adjust if other types are used. A more robust solution would store mime type.
        return urlToGenerativePart(publicUrl, 'image/png');
      })
    );

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    const prompt = `
You are a UX and Product Analyst. Based on the following screenshots from a single fintech app, perform these two tasks:

TASK 1: APP DESCRIPTION
Analyze all screenshots holistically and generate:
a) A short_description: A one-sentence summary of the app's primary function.
b) A long_description: A detailed paragraph (3-5 sentences) describing the app's key features, user interface, and target audience as inferred from the screenshots.

TASK 2: SCREENSHOT TITLES
For each of the ${screenshots.length} screenshots provided, generate a concise, descriptive title (3-5 words) that identifies the main action or information shown. The order of titles must correspond to the order of the images provided.

Provide the output in a single, valid JSON object with the following structure. Do not include any other text or markdown formatting.
{
  "short_description": "...",
  "long_description": "...",
  "screenshot_titles": ["title for image 1", "title for image 2", ...]
}
`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const jsonText = response.text().replace(/```json|```/g, '').trim();
    const aiResult = JSON.parse(jsonText);

    // --- Update database with AI results ---
    
    // 1. Update competitor descriptions
    const { error: updateCompError } = await supabase
      .from('competitors')
      .update({
        short_description: aiResult.short_description,
        long_description: aiResult.long_description,
      })
      .eq('id', competitor_id);
    if (updateCompError) throw updateCompError;

    // 2. Update screenshot titles
    const updatePromises = screenshots.map((ss, index) =>
      supabase
        .from('competitor_screenshots')
        .update({ ai_title: aiResult.screenshot_titles[index] })
        .eq('id', ss.id)
    );
    const results = await Promise.all(updatePromises);
    const updateErrors = results.map(r => r.error).filter(Boolean);
    if (updateErrors.length > 0) {
      throw new Error(`Failed to update some screenshot titles: ${updateErrors.map(e => e.message).join(', ')}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});