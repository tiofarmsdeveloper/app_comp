// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('ai_title')
      .eq('competitor_id', competitor_id)
      .not('ai_title', 'is', null);
    if (screenshotsError) throw screenshotsError;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing GEMINI_API_KEY.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a senior business and product strategist specializing in the fintech industry.
I will provide you with information we have on a competitor called "${competitor.name}".
Your task is to synthesize all of this information with your extensive knowledge base to generate a comprehensive and up-to-date analysis of this company.

--- PROVIDED INFORMATION ---

Short Description: ${competitor.short_description || 'Not provided.'}

Long Description: ${competitor.long_description || 'Not provided.'}

YouTube Videos:
${(competitor.youtube_videos && competitor.youtube_videos.length > 0) ? competitor.youtube_videos.map((url: string) => `- ${url}`).join('\n') : 'None provided.'}

Key App Screens (from analyzed screenshots):
${(screenshots && screenshots.length > 0) ? screenshots.map(s => `- ${s.ai_title}`).join('\n') : 'None provided.'}

--- YOUR ANALYSIS TASK ---

Based on all the provided materials and your broader knowledge, provide a detailed analysis covering the following points:
- Key Features and Product Offerings
- Unique Selling Propositions (What makes them stand out?)
- Target Audience
- Potential Strengths and Weaknesses

Format your response as a structured markdown text. This will be used as the input for a final comparison report.
`;

    const result = await model.generateContent(prompt);
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