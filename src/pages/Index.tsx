"use client";

import { useState } from "react";
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
import { Loader2 } from "lucide-react";

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
    if (analysisResult) {
      setAnalysisResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }

    setIsLoading(true);
    const toastId = showLoading(`Analyzing ${uploadedFile.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const { data, error } = await supabase.functions.invoke("analyze-image", {
        body: formData,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysisResult(data.analysis);
      showSuccess("Analysis complete!");
    } catch (err) {
      console.error("Analysis failed:", err);
      showError(
        err instanceof Error ? err.message : "An unknown error occurred.",
      );
    } finally {
      setIsLoading(false);
      if (toastId) {
        dismissToast(toastId);
      }
    }
  };

  const handleClear = () => {
    setUploadedFile(null);
    setAnalysisResult(null);
    // We need to reset the file input in the FileUpload component as well.
    // A simple way is to re-render the component by changing a key, but for now,
    // we will just clear the state here. The FileUpload component itself doesn't
    // expose a reset method, so this will do.
  };

  if (analysisResult) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
        <AnalysisResult result={analysisResult} onClear={handleClear} />
        <div className="absolute bottom-0">
          <MadeWithDyad />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
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
                Analyzing...
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