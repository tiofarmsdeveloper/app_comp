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

    const modelName = settings.find(s => s.key === 'gemini_model')?.value || 'gemini-pro';
    const sinderDescription = settings.find(s => s.key === 'sinder_description')?.value || "The user's app.";

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      throw new Error("No file provided.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Step 1: Analyze the user's screenshot
    const userAnalysisPrompt = "Analyze this fintech app screenshot. Extract: UI elements, visual hierarchy, color palette, information density, call-to-actions, trust signals, and user flow. Format as structured text.";
    const imagePart = await fileToGenerativePart(file);
    const userAnalysisResult = await model.generateContent([userAnalysisPrompt, imagePart]);
    const userAnalysisText = userAnalysisResult.response.text();

    // Step 2: Identify the app and its top competitors from the analysis
    const identifyCompetitorsPrompt = `Based on the following UI analysis of a fintech app, identify the likely name of the app and its top 3 direct competitors. Return the answer ONLY as a valid JSON object with the keys "appName" and "competitors" (an array of strings). Do not include any other text or markdown formatting.

ANALYSIS:
${userAnalysisText}`;
    const competitorsResult = await model.generateContent(identifyCompetitorsPrompt);
    const competitorsText = competitorsResult.response.text().replace(/```json|```/g, '').trim();
    const competitorsJSON = JSON.parse(competitorsText);
    const competitorNames = competitorsJSON.competitors;

    // Step 3: Generate a comparison based on knowledge, not images
    const comparisonPrompt = `
You are a world-class UX and product strategy expert for fintech mobile apps. Your advice is sharp, insightful, and highly actionable. You specialize in screen-by-screen analysis.

Here is a brief description of the user's app, Sinder:
--- SINDER DESCRIPTION ---
${sinderDescription}
---

An analysis of a user-submitted fintech app screenshot is provided below. This represents a single screen in their user flow.
--- USER APP ANALYSIS (SINGLE SCREEN) ---
${userAnalysisText}

Based on that analysis, its top 3 market competitors have been identified as: ${competitorNames.join(', ')}.

--- YOUR TASK ---
Your analysis MUST be strictly confined to the features and UI elements visible in the provided screenshot analysis.

1.  **Acknowledge the Context:** Start by identifying the likely purpose of the screen (e.g., "This appears to be a dashboard screen...").
2.  **Screen-Specific Comparison:** Use your extensive knowledge of the competitor apps to compare the user's screen against what you know about their *equivalent screens*. For example, if the user's screenshot is a transaction history, compare it to the typical transaction history screens of the competitors.
3.  **State Your Assumptions Clearly:** If you don't have specific, up-to-date knowledge about a competitor's equivalent screen, you MUST state that. For example: "While Revolut's current dashboard may have changed, it typically excels at..." This transparency is crucial.
4.  **Avoid Unfair Criticisms:** **Do not** criticize the user's app for lacking features that are not visible or wouldn't belong on this specific screen. This is a critical instruction.
5.  **Actionable Recommendations:** Provide 5 concrete, actionable recommendations to improve *this specific screen* or the immediate user flow it implies. Frame these as solutions to common user problems seen on similar screens in app store reviews.

Structure your response into three sections using markdown:
1.  **Key Strengths (On This Screen):** Based on the analysis, identify 2-3 clear advantages the user's screen has over typical competitor designs for this screen type.
2.  **Critical Gaps (On This Screen):** Identify 2-3 key areas where the identified competitors generally offer a better experience on this type of screen.
3.  **5 Actionable Recommendations (For This Screen):** Provide five concrete recommendations.

Format the output as clean, structured markdown. Do not include a preamble or introduction.
`;
    const comparisonResult = await model.generateContent(comparisonPrompt);
    const comparisonText = comparisonResult.response.text();

    return new Response(JSON.stringify({ 
      userAnalysis: userAnalysisText,
      comparison: comparisonText 
    }), {
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