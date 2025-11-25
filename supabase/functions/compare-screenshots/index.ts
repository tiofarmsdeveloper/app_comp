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

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['gemini_model', 'sinder_description']);

    if (settingsError) {
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    const modelName = settings.find(s => s.key === 'gemini_model')?.value || 'gemini-pro';
    const sinderDescription = settings.find(s => s.key === 'sinder_description')?.value || "The user's app.";

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const { userAnalysis, competitorAnalysis, competitorName } = await req.json();
    if (!userAnalysis || !competitorAnalysis || !competitorName) {
      throw new Error("Invalid input: userAnalysis, competitorAnalysis, and competitorName are required.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are a world-class UX and product strategy expert specializing in screen-by-screen analysis of mobile apps.

Here is a brief description of the user's app, Sinder:
--- SINDER DESCRIPTION ---
${sinderDescription}
---

You will be given two analyses: one for a screen from the user's app (Sinder) and one for an equivalent screen from a competitor app.

--- USER APP (SINDER) ANALYSIS ---
${userAnalysis}
---

--- COMPETITOR APP (${competitorName}) ANALYSIS ---
${competitorAnalysis}
---

--- YOUR TASK ---
Your analysis MUST be strictly confined to the features and UI elements described in the two analyses provided.

1.  **Direct Comparison:** Directly compare Sinder's screen against the competitor's screen. Focus on layout, information hierarchy, calls-to-action, and visible features.
2.  **Avoid Assumptions:** Do not criticize Sinder for lacking features that are not visible or wouldn't belong on this specific screen. This is a critical instruction.
3.  **Actionable Recommendations:** Provide 3-5 concrete, actionable recommendations for Sinder to improve *this specific screen* based *only* on this direct comparison.

Structure your response into three sections using markdown:
1.  **Sinder's Key Strengths (vs. ${competitorName}):**
2.  **Sinder's Critical Gaps (vs. ${competitorName}):**
3.  **Actionable Recommendations for Sinder:**

Format the output as clean, structured markdown. Do not include a preamble or introduction.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const comparisonText = response.text();

    return new Response(JSON.stringify({ comparison: comparisonText }), {
      headers: { ...corsHeaders, "Content-type": "application/json" },
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