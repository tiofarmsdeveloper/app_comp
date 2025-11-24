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

    if (modelError && modelError.code !== 'PGRST116') { // Ignore 'not found' error
      throw new Error(`Failed to fetch model from settings: ${modelError.message}`);
    }
    
    const modelName = modelSetting?.value || 'gemini-pro'; // Fallback to gemini-pro

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const { userAnalysis, competitorAnalyses } = await req.json();
    if (!userAnalysis || !competitorAnalyses) {
      throw new Error("Invalid input: userAnalysis and competitorAnalyses are required.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const competitorAnalysesText = competitorAnalyses.map((analysis, index) => `
--- COMPETITOR ${index + 1} ANALYSIS ---
${analysis}
    `).join('\n');

    const prompt = `
You are a UX and product strategy expert.
First, here is an analysis of a user-submitted fintech app screenshot:
--- USER APP ANALYSIS ---
${userAnalysis}
Now, here are the analyses of several competitor apps:
${competitorAnalysesText}
--- TASK ---
Based on all the provided analyses, compare the user's app against the competitors.
Structure your response into three sections:
1.  **What the user's app does better:** Identify 2-3 key strengths.
2.  **What competitors do better:** Identify 2-3 key areas where competitors excel.
3.  **5 Actionable Recommendations:** Provide five specific, concrete recommendations for the user's app to improve its competitive positioning. These should be actionable and clear.
Format the output as clean, structured text.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const comparisonText = response.text();

    return new Response(JSON.stringify({ comparison: comparisonText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});