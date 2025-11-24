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
      console.error("Supabase error fetching model:", modelError);
      throw new Error(`Failed to fetch model from settings: ${modelError.message}`);
    }
    
    const modelName = modelSetting?.value || 'gemini-1.5-flash';

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set.");
      throw new Error("Server configuration error: Missing API key.");
    }

    const { analysis } = await req.json();
    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analysis text is required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Generate a concise, descriptive title (4-6 words) for the following app analysis. The title should be suitable for a history list. Do not use quotes or any special formatting.
    
    ANALYSIS:
    ${analysis.substring(0, 500)}...
    
    TITLE:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const title = response.text().replace(/["']/g, "").trim();

    return new Response(JSON.stringify({ title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in generate-title function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});