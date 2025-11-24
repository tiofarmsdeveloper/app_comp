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
      return new Response(JSON.stringify({ error: "competitor_id and at least one screenshot_id are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use service role key for admin access
    );

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
        return urlToGenerativePart(publicUrl, 'image/png');
      })
    );

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set.");
      throw new Error("Server configuration error: Missing API key.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const prompt = `
You are a UX Analyst. For each of the ${screenshots.length} fintech app screenshots provided, generate a concise, descriptive title (3-5 words) that identifies the main action or information shown. The order of titles must correspond to the order of the images provided.

Provide the output in a single, valid JSON object with the following structure. Do not include any other text or markdown formatting.
{
  "screenshot_titles": ["title for image 1", "title for image 2", ...]
}
`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const jsonText = response.text().replace(/```json|```/g, '').trim();
    
    let aiResult;
    try {
      aiResult = JSON.parse(jsonText);
       if (!aiResult.screenshot_titles || aiResult.screenshot_titles.length !== screenshots.length) {
        throw new Error("AI response is missing titles or has incorrect number of titles.");
      }
    } catch (e) {
      console.error("Failed to parse JSON from AI response:", jsonText, e.message);
      throw new Error("AI returned an invalid response format.");
    }

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
    console.error("Error in generate-competitor-details function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});