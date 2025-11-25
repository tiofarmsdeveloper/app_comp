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
    throw new Error(`Failed to fetch image from URL: ${url}. Status: ${response.status}`);
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
    const { competitor_id } = await req.json();
    if (!competitor_id) {
      return new Response(JSON.stringify({ error: "competitor_id is required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('name, short_description, long_description, youtube_videos')
      .eq('id', competitor_id)
      .single();
    if (competitorError) throw competitorError;

    const { data: screenshots, error: screenshotsError } = await supabase
      .from('competitor_screenshots')
      .select('image_path')
      .eq('competitor_id', competitor_id);
    if (screenshotsError) throw screenshotsError;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing GEMINI_API_KEY.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Step 1: Get base analysis from text-only data
    const textPrompt = `
      You are a senior business and product strategist specializing in the fintech industry.
      Analyze the following fintech company based ONLY on the text information provided to create a baseline analysis of about 150 words.
      
      --- PROVIDED TEXT INFORMATION ---
      Name: ${competitor.name}
      Short Description: ${competitor.short_description || 'Not provided.'}
      Long Description: ${competitor.long_description || 'Not provided.'}
      YouTube Videos: ${(competitor.youtube_videos && competitor.youtube_videos.length > 0) ? competitor.youtube_videos.map((url: string) => `- ${url}`).join('\n') : 'None provided.'}

      --- YOUR ANALYSIS TASK ---
      Provide a baseline analysis covering: Key Features, Unique Selling Propositions, Target Audience, Strengths, and Weaknesses.
      If information for a category is not available from the provided data, explicitly state that instead of making assumptions.
      Format your response as structured markdown. This is the first step; we will add visual analysis later.
    `;
    const textResult = await model.generateContent(textPrompt);
    let augmentedAnalysis = (await textResult.response).text();

    // Step 2: Iteratively update the analysis with each screenshot
    if (screenshots && screenshots.length > 0) {
      for (const screenshot of screenshots) {
        const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(screenshot.image_path);
        const imagePart = await urlToGenerativePart(publicUrl, 'image/png');

        const imagePrompt = `
          You are a fintech product strategist. You have an existing analysis of a company. Now, you are receiving a new screenshot from their app.
          Your task is to augment and refine the existing analysis with new insights from this screenshot, expanding the total length to approximately 300 words.
          Do not repeat information already present. Focus on adding new details about UI/UX, features, or user flows revealed in the image.
          Output the complete, updated analysis in structured markdown.

          --- EXISTING ANALYSIS ---
          ${augmentedAnalysis}

          --- NEW SCREENSHOT TO ANALYZE ---
          (see attached image)

          --- YOUR TASK ---
          Return the fully updated and integrated analysis, ensuring the final output is around 300 words.
        `;
        const imageResult = await model.generateContent([imagePrompt, imagePart]);
        augmentedAnalysis = (await imageResult.response).text();
      }
    }

    return new Response(JSON.stringify({ analysis: augmentedAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in augment-competitor-data function:", error.message);
    return new Response(JSON.stringify({ error: `Function failed: ${error.message}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});