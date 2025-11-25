// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function urlToGenerativePart(url: string) {
  try {
    console.log(`Attempting to fetch image from URL: ${url}`);
    const response = await fetch(url, { 
      method: 'GET',
      headers: {
        'User-Agent': 'Sinder Competitor Analysis Tool/1.0'
      }
    });

    if (!response.ok) {
      console.error(`Image fetch failed. Status: ${response.status}, StatusText: ${response.statusText}`);
      throw new Error(`Failed to fetch image. Status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    console.log(`Image Content Type: ${contentType}`);

    const arrayBuffer = await response.arrayBuffer();
    const base64Encoded = encode(new Uint8Array(arrayBuffer));
    
    return {
      inlineData: { 
        data: base64Encoded, 
        mimeType: contentType || 'image/png'
      },
    };
  } catch (error) {
    console.error('Error in urlToGenerativePart:', error);
    throw error;
  }
}

serve(async (req) => {
  console.log('Augment Competitor Data Function Started');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { competitor_id } = await req.json();
    console.log(`Processing competitor ID: ${competitor_id}`);

    if (!competitor_id) {
      return new Response(JSON.stringify({ 
        error: "competitor_id is required.",
        details: "No competitor ID was provided in the request body." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('name, short_description, long_description, youtube_videos')
      .eq('id', competitor_id)
      .single();

    if (competitorError) {
      console.error('Competitor Fetch Error:', competitorError);
      return new Response(JSON.stringify({ 
        error: "Failed to fetch competitor data",
        details: competitorError 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const { data: screenshots, error: screenshotsError } = await supabase
      .from('competitor_screenshots')
      .select('image_path')
      .eq('competitor_id', competitor_id);

    if (screenshotsError) {
      console.error('Screenshots Fetch Error:', screenshotsError);
      return new Response(JSON.stringify({ 
        error: "Failed to fetch competitor screenshots",
        details: screenshotsError 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    console.log(`Found ${screenshots.length} screenshots for competitor`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error('Missing Gemini API Key');
      return new Response(JSON.stringify({ 
        error: "Server configuration error",
        details: "Missing GEMINI_API_KEY" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const textPrompt = `
      You are a senior business and product strategist specializing in the fintech industry.
      Analyze the following fintech company based ONLY on the text information provided to create a baseline analysis of about 150 words.
      
      --- PROVIDED TEXT INFORMATION ---
      Name: ${competitor.name}
      Short Description: ${competitor.short_description || 'Not provided.'}
      Long Description: ${competitor.long_description || 'Not provided.'}
      YouTube Videos: ${(competitor.youtube_videos && competitor.youtube_videos.length > 0) ? competitor.youtube_videos.map((url: string) => `- ${url}`).join('\n') : 'None provided.'}

      --- YOUR ANALYSIS TASK ---
      Provide a baseline analysis covering: Key Features, Unique Selling Propositions, Target Audience, Strengths, and Weaknesses.
      If information for a category is not available from the provided data, explicitly state that instead of making assumptions.
      Format your response as structured markdown.
    `;

    const textResult = await model.generateContent(textPrompt);
    let augmentedAnalysis = (await textResult.response).text();

    if (screenshots && screenshots.length > 0) {
      for (const screenshot of screenshots) {
        try {
          const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(screenshot.image_path);
          console.log(`Processing screenshot: ${publicUrl}`);

          const imagePart = await urlToGenerativePart(publicUrl);

          const imagePrompt = `
            You are a fintech product strategist. You have an existing analysis of a company. 
            Now, you are receiving a new screenshot from their app.
            Your task is to augment and refine the existing analysis with new insights from this screenshot, 
            expanding the total length to approximately 300 words.
            Do not repeat information already present. 
            Focus on adding new details about UI/UX, features, or user flows revealed in the image.
            Output the complete, updated analysis in structured markdown.

            --- EXISTING ANALYSIS ---
            ${augmentedAnalysis}

            --- NEW SCREENSHOT TO ANALYZE ---
            (see attached image)

            --- YOUR TASK ---
            Return the fully updated and integrated analysis, ensuring the final output is around 300 words.
          `;

          const imageResult = await model.generateContent([imagePrompt, imagePart]);
          augmentedAnalysis = (await imageResult.response).text();
        } catch (screenshotError) {
          console.error(`Error processing screenshot ${screenshot.image_path}:`, screenshotError);
          // Continue with the existing analysis if a screenshot fails
        }
      }
    }

    return new Response(JSON.stringify({ analysis: augmentedAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Critical Error in augment-competitor-data:', error);
    return new Response(JSON.stringify({ 
      error: "Unexpected server error",
      details: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});