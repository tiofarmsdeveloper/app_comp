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
    const { competitor_name, competitor_data } = await req.json();
    if (!competitor_name || !competitor_data) {
      return new Response(JSON.stringify({ error: "competitor_name and competitor_data are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("Server configuration error: Missing GEMINI_API_KEY.");
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a senior business and product strategist specializing in the fintech industry.
I will provide you with some basic information we have on a competitor called "${competitor_name}".
Your task is to use this information as a starting point and combine it with your extensive knowledge base to generate a comprehensive and up-to-date analysis of this company.

Here is the information we have:
- Short Description: ${competitor_data.short_description}
- Long Description: ${competitor_data.long_description}

Based on this and your broader knowledge, provide a detailed analysis covering the following points:
- Key Features and Product Offerings
- Unique Selling Propositions (What makes them stand out?)
- Target Audience
- Potential Strengths and Weaknesses

Format your response as a structured markdown text. This will be used as the input for a final comparison report.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const augmentedAnalysis = response.text();

    return new Response(JSON.stringify({ analysis: augmentedAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in augment-competitor-data function:", error.message);
    return new Response(JSON.stringify({ error: `Function failed: ${error.message}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});