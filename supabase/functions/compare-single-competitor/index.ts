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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: modelSetting, error: modelError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gemini_model')
      .single();

    if (modelError && modelError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch model from settings: ${modelError.message}`);
    }
    
    const modelName = modelSetting?.value || 'gemini-1.5-flash';

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing API key.");
    }

    const { userAnalysis, competitorAnalysis, competitorName } = await req.json();
    if (!userAnalysis || !competitorAnalysis || !competitorName) {
      return new Response(JSON.stringify({ error: "userAnalysis, competitorAnalysis, and competitorName are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
You are a world-class UX and product strategy expert for fintech mobile apps.
Compare the two app analyses provided below: one for the user's app and one for a competitor named "${competitorName}".

--- USER APP ANALYSIS ---
${userAnalysis}

--- COMPETITOR ANALYSIS (${competitorName}) ---
${competitorAnalysis}

--- YOUR TASK ---
Provide a detailed comparison. Your entire response must be a single, valid JSON object with the following structure. Do not include any other text, markdown, or explanations.

{
  "competitor_name": "${competitorName}",
  "competitor_analysis_markdown": ${JSON.stringify(competitorAnalysis)},
  "comparison_summary": "A brief, one-sentence summary of the comparison, highlighting the key difference.",
  "user_app_rating": <A number between 1.0 and 5.0 representing the user app's overall quality based on the analysis>,
  "competitor_app_rating": <A number between 1.0 and 5.0 representing the competitor's overall quality based on the analysis>,
  "user_app_strengths": ["A key strength of the user's app.", "Another key strength."],
  "competitor_app_strengths": ["A key strength of the competitor's app.", "Another key strength."],
  "actionable_recommendations": ["A concrete recommendation for the user's app to gain an edge.", "Another actionable recommendation."]
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    const comparisonData = JSON.parse(jsonText);

    return new Response(JSON.stringify(comparisonData), {
      headers: { ...corsHeaders, "Content-type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in compare-single-competitor function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});