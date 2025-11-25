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
  id: string;
  name: string;
  primary_screenshot_path: string | null;
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
      const { data, error } = await supabase
        .from("competitors")
        .select("id, name, primary_screenshot_path")
        .not("primary_screenshot_path", "is", null);

      if (error) {
        showError("Could not load competitors. Please try again later.");
        console.error("Error fetching competitors:", error);
      } else {
        setCompetitors(data || []);
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

  const analyzeImage = async (
    imageSource: File | string,
    isPath = false,
  ): Promise<string> => {
    let file: File;
    if (isPath) {
      const { data: blob, error } = await supabase.storage
        .from("competitor_screenshots")
        .download(imageSource as string);
      if (error) throw new Error(`Failed to download screenshot: ${error.message}`);
      const fileName = (imageSource as string).split("/").pop()!;
      file = new File([blob], fileName, { type: blob.type });
    } else {
      file = imageSource as File;
    }

    const formData = new FormData();
    formData.append("file", file);

    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: formData,
    });

    if (error) throw new Error(`Analysis failed: ${error.message}`);
    if (data.error) throw new Error(`Analysis failed: ${data.error}`);

    return data.analysis;
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }
    if (competitors.length === 0) {
      showError(
        "No competitors found. Please add competitors in the settings.",
      );
      return;
    }

    setIsLoading(true);
    const toastId = showLoading("Starting analysis...");

    try {
      setLoadingMessage(`Analyzing your screenshot...`);
      const userAnalysisPromise = analyzeImage(uploadedFile);

      setLoadingMessage(`Analyzing ${competitors.length} competitors...`);
      const competitorPromises = competitors.map((competitor) =>
        analyzeImage(competitor.primary_screenshot_path!, true),
      );

      const [userResult, ...competitorResults] = await Promise.all([
        userAnalysisPromise,
        ...competitorPromises,
      ]);

      setUserAnalysis(userResult);
      showSuccess("Initial analyses complete. Now comparing...");

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

      setLoadingMessage("Generating title...");
      const { data: titleData, error: titleError } =
        await supabase.functions.invoke("generate-title", {
          body: { analysis: userResult },
        });
      if (titleError) throw new Error(titleError.message);
      if (titleData.error) throw new Error(titleData.error);
      const title = titleData.title;

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
            disabled={!uploadedFile || isLoading || competitors.length === 0}
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