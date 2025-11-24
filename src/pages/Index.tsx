"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { AnalysisResult } from "@/components/AnalysisResult";
import { ComparisonResult } from "@/components/ComparisonResult";
import { Loader2, Settings, History } from "lucide-react";

interface Competitor {
  name: string;
  imageUrl: string;
}

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResult, setComparisonResult] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  useEffect(() => {
    const fetchCompetitors = async () => {
      const { data: competitorsData, error } = await supabase
        .from("competitors")
        .select("id, name");

      if (error) {
        console.error("Failed to fetch competitors for analysis", error);
      } else {
        const competitorsWithUrls = await Promise.all(
          (competitorsData || []).map(async (c) => {
            const { data: screenshots } = await supabase
              .from("competitor_screenshots")
              .select("image_path")
              .eq("competitor_id", c.id)
              .limit(1);
            
            let imageUrl = "/placeholder.svg"; // default
            if (screenshots && screenshots.length > 0) {
              const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(screenshots[0].image_path);
              imageUrl = publicUrl;
            }
            
            return { name: c.name, imageUrl };
          })
        );
        setCompetitors(competitorsWithUrls.filter(c => c.imageUrl !== "/placeholder.svg"));
      }
    };
    fetchCompetitors();
  }, []);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
    if (userAnalysis || comparisonResult) {
      setUserAnalysis(null);
      setComparisonResult(null);
    }
  };

  const analyzeImage = async (file: File, fileName: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: formData,
    });

    if (error)
      throw new Error(`Analysis failed for ${fileName}: ${error.message}`);
    if (data.error)
      throw new Error(`Analysis failed for ${fileName}: ${data.error}`);

    return data.analysis;
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }
    if (competitors.length === 0) {
      showError("Please add at least one competitor with a screenshot in the settings before analyzing.");
      return;
    }

    setIsLoading(true);
    const toastId = showLoading("Starting analysis...");

    try {
      // Step 1: Analyze user and competitor images
      setLoadingMessage(`Analyzing your screenshot...`);
      const userAnalysisPromise = analyzeImage(uploadedFile, uploadedFile.name);

      setLoadingMessage(`Analyzing ${competitors.length} competitors...`);
      const competitorPromises = competitors.map(async (competitor) => {
        const response = await fetch(competitor.imageUrl);
        if (!response.ok)
          throw new Error(`Failed to fetch ${competitor.name} screenshot.`);
        const blob = await response.blob();
        const file = new File([blob], competitor.name, { type: blob.type });
        return analyzeImage(file, competitor.name);
      });

      const [userResult, ...competitorResults] = await Promise.all([
        userAnalysisPromise,
        ...competitorPromises,
      ]);

      setUserAnalysis(userResult);
      showSuccess("Initial analyses complete. Now comparing...");
      
      // Step 2: Get comparison
      setLoadingMessage("Comparing against competitors...");
      const { data: comparisonData, error: comparisonError } =
        await supabase.functions.invoke("compare-analyses", {
          body: {
            userAnalysis: userResult,
            competitorAnalyses: competitorResults.map((analysis, index) => ({
              name: competitors[index].name,
              analysis: analysis,
            })),
          },
        });

      if (comparisonError) throw new Error(comparisonError.message);
      if (comparisonData.error) throw new Error(comparisonData.error);
      const comparison = comparisonData.comparison;
      setComparisonResult(comparison);
      
      // Step 3: Generate title
      setLoadingMessage("Generating title...");
      const { data: titleData, error: titleError } = await supabase.functions.invoke("generate-title", {
        body: { analysis: userResult },
      });
      if (titleError) throw new Error(titleError.message);
      if (titleData.error) throw new Error(titleData.error);
      const title = titleData.title;

      // Step 4: Save to history
      setLoadingMessage("Saving to history...");
      const { error: insertError } = await supabase
        .from("analysis_history")
        .insert({
          title: title,
          user_analysis: userResult,
          comparison_result: comparison,
        });
      if (insertError) throw insertError;

      showSuccess("Analysis complete and saved to history!");
    } catch (err) {
      console.error("Full analysis process failed:", err);
      showError(
        err instanceof Error ? err.message : "An unknown error occurred.",
      );
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
      if (toastId) {
        dismissToast(toastId);
      }
    }
  };

  const handleClear = () => {
    setUploadedFile(null);
    setUserAnalysis(null);
    setComparisonResult(null);
  };

  if (userAnalysis) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 py-12">
        <div className="w-full max-w-2xl">
          <AnalysisResult result={userAnalysis} onClear={handleClear} />
          {comparisonResult && <ComparisonResult result={comparisonResult} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/history">
            <History className="h-5 w-5" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">
          Sinder Competitor Analysis Tool
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Upload a screenshot of a mobile app to get started.
        </p>

        <div className="flex flex-col items-center gap-6">
          <FileUpload onFileChange={handleFileChange} />
          <Button
            size="lg"
            onClick={handleAnalyze}
            disabled={!uploadedFile || isLoading}
            className="w-full max-w-lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingMessage || "Analyzing..."}
              </>
            ) : (
              "Analyze Against Competitors"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;