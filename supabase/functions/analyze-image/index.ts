// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert a file to a base64 string in a Deno environment
async function fileToGenerativePart(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64Encoded = encode(new Uint8Array(arrayBuffer));
  return {
    inlineData: { data: base64Encoded, mimeType: file.type },
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Get Gemini API Key from environment variables (Supabase secrets)
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    // 2. Parse the request body to get the file
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided." }), {
        status: 200, // Return 200 to provide a clear error message on the client
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Initialize the Google Generative AI client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // 4. Prepare the prompt and image for the API
    const prompt = "Analyze this fintech app screenshot. Extract: UI elements, visual hierarchy, color palette, information density, call-to-actions, trust signals, and user flow. Format as structured text.";
    const imagePart = await fileToGenerativePart(file);

    // 5. Call the Gemini API
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // 6. Return the analysis
    return new Response(JSON.stringify({ analysis: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // Return 200 to provide a clear error message on the client
    });
  }
});