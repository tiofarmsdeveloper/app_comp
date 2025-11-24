"use client";

import { useState } from "react";
import { Link } from "react-router-dom";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { MadeWithDyad } from "@/components/made-with-dyad";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { AnalysisResult } from "@/components/AnalysisResult";
import { ComparisonResult } from "@/components/ComparisonResult";
import { Loader2, Settings } from "lucide-react";

const competitors = [
  { name: "Revolut", path: "/competitors/revolut.png" },
  { name: "Wise", path: "/competitors/wise.png" },
  { name: "N26", path: "/competitors/n26.png" },
  { name: "Monzo", path: "/competitors/monzo.png" },
  { name: "Curve", path: "/competitors/curve.png" },
];

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResult, setComparisonResult] = useState<string | null>(null);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
    if (userAnalysis || comparisonResult) {
      setUserAnalysis(null);
      setComparisonResult(null);
    }
  };

  const analyzeImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: formData,
    });

    if (error)
      throw new Error(`Analysis failed for ${file.name}: ${error.message}`);
    if (data.error)
      throw new Error(`Analysis failed for ${file.name}: ${data.error}`);

    return data.analysis;
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }

    setIsLoading(true);
    const toastId = showLoading("Starting analysis...");

    try {
      setLoadingMessage(`Analyzing your screenshot...`);
      const userAnalysisPromise = analyzeImage(uploadedFile);

      setLoadingMessage(`Analyzing competitors...`);
      const competitorPromises = competitors.map(async (competitor) => {
        const response = await fetch(competitor.path);
        if (!response.ok)
          throw new Error(`Failed to fetch ${competitor.name} screenshot.`);
        const blob = await response.blob();
        const fileName = competitor.path.split("/").pop()!;
        const file = new File([blob], fileName, { type: blob.type });
        return analyzeImage(file);
      });

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
            competitorAnalyses: competitorResults,
          },
        });

      if (comparisonError) throw new Error(comparisonError.message);
      if (comparisonData.error) throw new Error(comparisonData.error);

      setComparisonResult(comparisonData.comparison);
      showSuccess("Comparison complete!");
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
        <div className="absolute bottom-0">
          <MadeWithDyad />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="absolute top-4 right-4">
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
      <div className="absolute bottom-0">
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default Index;