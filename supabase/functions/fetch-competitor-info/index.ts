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
    // 1. Check for required environment variables first
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
      console.error("Server configuration error: Missing one or more required environment variables (URL, Service Key, or Gemini Key).");
      throw new Error("Server configuration error: Missing required secrets.");
    }

    // 2. Get request body
    const { competitor_id, competitor_name } = await req.json();
    if (!competitor_id || !competitor_name) {
      return new Response(JSON.stringify({ error: "competitor_id and competitor_name are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 3. Initialize clients
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. Generate content with a more robust prompt
    const prompt = `
You are a business analyst with extensive knowledge of the tech industry. Based on your existing knowledge of the fintech company named "${competitor_name}", generate the following:
1.  A short_description: A concise, one-sentence summary of the company's primary function.
2.  A long_description: A detailed paragraph (3-5 sentences) describing the company, its key products, and its target audience. If you know their official website or other relevant public links, incorporate them into the description using markdown format, for example: [Official Website](https://example.com).

If you do not have specific knowledge of "${competitor_name}", state that clearly in the descriptions.

Provide the output in a single, valid JSON object with the following structure. Do not include any other text or markdown formatting.
{
  "short_description": "...",
  "long_description": "..."
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().replace(/```json|```/g, '').trim();
    
    let aiResult;
    try {
      aiResult = JSON.parse(jsonText);
      if (!aiResult.short_description || !aiResult.long_description) {
        throw new Error("AI response was missing the required description fields.");
      }
    } catch (e) {
      console.error("Failed to parse JSON from AI response:", jsonText, e.message);
      throw new Error("AI returned an invalid response format. Please try again.");
    }

    // 5. Update database
    const { error: updateError } = await supabase
      .from('competitors')
      .update({
        short_description: aiResult.short_description,
        long_description: aiResult.long_description,
      })
      .eq('id', competitor_id);

    if (updateError) {
        console.error("Supabase update error:", updateError.message);
        throw updateError;
    }

    return new Response(JSON.stringify({ success: true, data: aiResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in fetch-competitor-info function:", error.message);
    // Return a more descriptive error to the client
    return new Response(JSON.stringify({ error: `Function failed: ${error.message}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});