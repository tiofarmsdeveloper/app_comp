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

    const { data: modelSetting, error: modelError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gemini_model')
      .single();

    if (modelError && modelError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch model from settings: ${modelError.message}`);
    }
    
    const modelName = modelSetting?.value || 'gemini-pro';

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

    // Step 3: Generate a comparison based on knowledge, not images, to prevent hallucination
    const comparisonPrompt = `
You are a world-class UX and product strategy expert for fintech mobile apps. Your advice is sharp, insightful, and highly actionable.
You have deep knowledge of the competitive landscape and common user feedback from app store reviews.

An analysis of a user-submitted fintech app screenshot is provided below:
--- USER APP ANALYSIS ---
${userAnalysisText}

Based on that analysis, its top 3 market competitors have been identified as: ${competitorNames.join(', ')}.

--- YOUR TASK ---
**Without searching for or describing specific competitor screenshots**, use your extensive knowledge of these competitor apps and common fintech UX patterns to perform a comparative analysis. Compare the user's app (based on its analysis) against the known features, strengths, and weaknesses of its competitors.

If you do not have specific knowledge about a feature for a competitor, you MUST explicitly state that, for example: "While detailed information on [Competitor]'s exact onboarding flow isn't available, successful apps in this space typically..." This transparency is crucial.

Structure your response into three sections using markdown for formatting:
1.  **Key Strengths vs. Market Leaders:** Identify 2-3 clear advantages the user's app appears to have.
2.  **Critical Gaps vs. Market Leaders:** Identify 2-3 key areas where the identified competitors are generally better.
3.  **5 Actionable Recommendations (From User Reviews):** Provide five concrete recommendations to gain a competitive edge. Frame these as solutions to common user problems seen in app store reviews for similar apps. Each recommendation must be clear and actionable.

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