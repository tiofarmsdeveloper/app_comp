// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`Failed to fetch models: ${errorBody.error.message}`);
    }

    const { models } = await response.json();

    // Filter for models that can be used for vision analysis and text generation
    const supportedModels = models
      .filter(model => 
        model.supportedGenerationMethods.includes("generateContent") &&
        model.name.includes("gemini")
      )
      .map(model => model.name.replace('models/', ''));

    return new Response(JSON.stringify({ models: supportedModels }), {
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