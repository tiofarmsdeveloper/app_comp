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
    const { competitor_name, competitor_data } = await req.json();
    if (!competitor_name || !competitor_data) {
      return new Response(JSON.stringify({ error: "competitor_name and competitor_data are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const imageParts = [];
    if (competitor_data.screenshots && competitor_data.screenshots.length > 0) {
      const imagePartPromises = competitor_data.screenshots.map((path: string) => {
        const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(path);
        return urlToGenerativePart(publicUrl, 'image/png');
      });
      imageParts.push(...await Promise.all(imagePartPromises));
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing GEMINI_API_KEY.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a senior business and product strategist specializing in the fintech industry.
I will provide you with information we have on a competitor called "${competitor_name}". This includes text descriptions, links to YouTube videos, and several screenshots of their app.
Your task is to synthesize all of this information with your extensive knowledge base to generate a comprehensive and up-to-date analysis of this company.

--- PROVIDED INFORMATION ---

Short Description: ${competitor_data.short_description || 'Not provided.'}

Long Description: ${competitor_data.long_description || 'Not provided.'}

YouTube Videos:
${(competitor_data.youtube_videos && competitor_data.youtube_videos.length > 0) ? competitor_data.youtube_videos.map((url: string) => `- ${url}`).join('\n') : 'None provided.'}

App Screenshots:
${imageParts.length > 0 ? `(See attached ${imageParts.length} images)` : 'None provided.'}

--- YOUR ANALYSIS TASK ---

Based on all the provided materials and your broader knowledge, provide a detailed analysis covering the following points:
- Key Features and Product Offerings (as seen in the screenshots and descriptions)
- Unique Selling Propositions (What makes them stand out?)
- Target Audience
- Potential Strengths and Weaknesses

Format your response as a structured markdown text. This will be used as the input for a final comparison report.
`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const augmentedAnalysis = response.text();

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