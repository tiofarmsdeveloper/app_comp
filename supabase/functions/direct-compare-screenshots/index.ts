// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fileToGenerativePart(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64Encoded = encode(new Uint8Array(arrayBuffer));
  return {
    inlineData: { data: base64Encoded, mimeType: file.type },
  };
}

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

    const modelName = settings.find(s => s.key === 'gemini_model')?.value || 'gemini-1.5-flash';
    const sinderDescription = settings.find(s => s.key === 'sinder_description')?.value || "The user's app.";

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const formData = await req.formData();
    const userFile = formData.get("userFile") as File | null;
    const competitorFile = formData.get("competitorFile") as File | null;
    const competitorName = formData.get("competitorName") as string | null;

    if (!userFile || !competitorFile || !competitorName) {
      throw new Error("Invalid input: userFile, competitorFile, and competitorName are required.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const userImagePart = await fileToGenerativePart(userFile);
    const competitorImagePart = await fileToGenerativePart(competitorFile);

    const prompt = `
You are a world-class UX and product strategy expert specializing in screen-by-screen analysis of mobile apps.

Here is a brief description of the user's app, Sinder:
--- SINDER DESCRIPTION ---
${sinderDescription}
---

You will be given two screenshots: one from the user's app (Sinder) and one from a competitor app.

--- YOUR TASK ---
Your analysis MUST be strictly confined to the features and UI elements visible in the two screenshots provided.

1.  **Direct Comparison:** Directly compare Sinder's screen against the competitor's screen. Focus on layout, information hierarchy, calls-to-action, and visible features.
2.  **Avoid Assumptions:** Do not criticize Sinder for lacking features that are not visible or wouldn't belong on this specific screen. This is a critical instruction.
3.  **Actionable Recommendations:** Provide 3-5 concrete, actionable recommendations for Sinder to improve *this specific screen* based *only* on this direct comparison.

Structure your response into three sections using markdown:
1.  **Sinder's Key Strengths (vs. ${competitorName}):**
2.  **Sinder's Critical Gaps (vs. ${competitorName}):**
3.  **Actionable Recommendations for Sinder:**

Format the output as clean, structured markdown. Do not include a preamble or introduction.
`;

    const result = await model.generateContent([prompt, "User's App (Sinder):", userImagePart, `Competitor App (${competitorName}):`, competitorImagePart]);
    const response = await result.response;
    const comparisonText = response.text();

    const userAnalysisPrompt = "Analyze this fintech app screenshot. Extract: UI elements, visual hierarchy, color palette, information density, call-to-actions, trust signals, and user flow. Format as structured text.";
    const userAnalysisResult = await model.generateContent([userAnalysisPrompt, userImagePart]);
    const userAnalysisText = userAnalysisResult.response.text();

    return new Response(JSON.stringify({ 
      comparison: comparisonText,
      userAnalysis: userAnalysisText
    }), {
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