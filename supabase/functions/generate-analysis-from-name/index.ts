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

    const { data: modelSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gemini_model')
      .single();
    
    const modelName = modelSetting?.value || 'gemini-pro';

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    const { competitorName } = await req.json();
    if (!competitorName) {
      throw new Error("competitorName is required.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
You are a world-class UX and product strategy expert for fintech mobile apps.
Based on your knowledge, provide a detailed analysis of the typical user interface and key features of the fintech app "${competitorName}".
Focus on elements you would typically find on a primary dashboard or home screen.
Your analysis must be structured in the same format as an analysis generated from a screenshot. Cover the following topics:
- UI Elements
- Visual Hierarchy
- Color Palette
- Information Density
- Call-to-Actions
- Trust Signals
- User Flow

Format the output as structured text. Do not include a preamble or introduction.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysis = response.text();

    return new Response(JSON.stringify({ analysis }), {
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