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

    const { userAnalysis, competitorAnalyses } = await req.json();
    if (!userAnalysis || !competitorAnalyses) {
      throw new Error("Invalid input: userAnalysis and competitorAnalyses are required.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const competitorAnalysesText = competitorAnalyses.map((comp) => `
--- COMPETITOR: ${comp.name} ---
${comp.analysis}
    `).join('\n');
    
    const competitorNames = competitorAnalyses.map(c => c.name).join(', ');

    const prompt = `
You are a world-class UX and product strategy expert for fintech mobile apps. Your advice is sharp, insightful, and highly actionable. You specialize in screen-by-screen analysis.

Here is a brief description of the user's app, Sinder:
--- SINDER DESCRIPTION ---
${sinderDescription}
---

First, here is an analysis of a user-submitted fintech app screenshot (Sinder). This represents a single screen in their user flow.
--- USER APP ANALYSIS (SINGLE SCREEN) ---
${userAnalysis}

Now, here are the analyses of single screenshots from several competitor apps, likely showing their equivalent screens.
${competitorAnalysesText}

--- YOUR TASK ---
Your analysis MUST be strictly confined to the features and UI elements visible in the provided screenshot analyses.

1.  **Acknowledge the Context:** Start by identifying the likely purpose of the screen (e.g., "This appears to be a dashboard screen...").
2.  **Screen-Specific Comparison:** Compare the user's app screen *only* against the equivalent competitor screens. Focus on layout, information hierarchy, calls-to-action, and visible features.
3.  **Avoid Assumptions:** **Do not** criticize the user's app for lacking features that are not visible or wouldn't belong on this specific screen. For example, if it's a home screen, do not mention a lack of login security features. This is a critical instruction.
4.  **Actionable Recommendations:** Provide 5 concrete, actionable recommendations to improve *this specific screen* or the immediate user flow it implies. Frame these as solutions to common user problems seen on similar screens in app store reviews.

Structure your response into three sections using markdown:
1.  **Key Strengths (On This Screen):** Identify 2-3 clear advantages the user's screen has over the competitors' equivalent screens.
2.  **Critical Gaps (On This Screen):** Identify 2-3 key areas where the competitors' screens are significantly better.
3.  **5 Actionable Recommendations (For This Screen):** Provide five concrete recommendations.

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