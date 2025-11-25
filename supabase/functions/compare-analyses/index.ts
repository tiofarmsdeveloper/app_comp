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
You are a world-class UX and product strategy expert for fintech mobile apps. Your advice is sharp, insightful, and highly actionable.
You have deep knowledge of the competitive landscape and common user feedback from app store reviews.

Here is a brief description of the user's app, Sinder:
--- SINDER DESCRIPTION ---
${sinderDescription}
---

First, here is an analysis of a user-submitted fintech app screenshot (Sinder):
--- USER APP ANALYSIS ---
${userAnalysis}

Now, here are the analyses of several competitor apps:
${competitorAnalysesText}

--- YOUR TASK ---
Based on all the provided analyses, compare the user's app against the competitors (${competitorNames}).
In your recommendations, incorporate insights as if you have analyzed thousands of app store reviews. For example, mention common user complaints (like hidden fees, poor customer service, confusing navigation) and praises (clear transaction history, easy budgeting tools, responsive support).

Structure your response into three sections using markdown for formatting:
1.  **Key Strengths vs. Competitors:** Identify 2-3 clear advantages the user's app has. Be specific.
2.  **Critical Competitive Gaps:** Identify 2-3 key areas where competitors are significantly better. Refer to specific competitors by name.
3.  **5 Actionable Recommendations (From User Reviews):** Provide five concrete recommendations to gain a competitive edge. Frame these as solutions to common user problems seen in reviews. Each recommendation must be clear and actionable.

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