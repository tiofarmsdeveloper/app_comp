"use client";

import { useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { FileUpload } from "@/components/FileUpload";
import { MultiFileUpload } from "@/components/MultiFileUpload";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Settings, History, RefreshCw } from "lucide-react";

type AnalysisType = "auto" | "screenshot";

interface Comparison {
  title: string;
  content: string;
}

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [competitorFiles, setCompetitorFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<Comparison[] | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType | null>(null);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
    handleClearResults();
  };

  const handleCompetitorFilesChange = (files: File[]) => {
    setCompetitorFiles(files);
    handleClearResults();
  };

  const handleClearResults = () => {
    if (userAnalysis || comparisonResults) {
      setUserAnalysis(null);
      setComparisonResults(null);
    }
  };

  const analyzeImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: formData,
    });
    if (error) throw new Error(`Analysis failed for ${file.name}: ${error.message}`);
    if (data.error) throw new Error(`Analysis failed for ${file.name}: ${data.error}`);
    return data.analysis;
  };

  const handleCompareScreenshots = async () => {
    if (!uploadedFile) {
      showError("Please upload your app's screenshot.");
      return;
    }
    if (competitorFiles.length === 0) {
      showError("Please upload at least one competitor screenshot.");
      return;
    }

    setIsLoading(true);
    setAnalysisType("screenshot");
    const toastId = showLoading("Starting analysis...");

    try {
      setLoadingMessage("Analyzing your screenshot...");
      const userAnalysisResult = await analyzeImage(uploadedFile);
      setUserAnalysis(userAnalysisResult);

      setLoadingMessage(`Analyzing ${competitorFiles.length} competitor(s)...`);
      const competitorAnalyses = await Promise.all(
        competitorFiles.map(file => analyzeImage(file))
      );

      setLoadingMessage("Generating comparisons...");
      const comparisonPromises = competitorAnalyses.map((compAnalysis, index) =>
        supabase.functions.invoke("compare-screenshots", {
          body: {
            userAnalysis: userAnalysisResult,
            competitorAnalysis: compAnalysis,
            competitorName: competitorFiles[index].name,
          },
        })
      );
      
      const comparisonResponses = await Promise.all(comparisonPromises);
      const results: Comparison[] = [];
      for (let i = 0; i < comparisonResponses.length; i++) {
        const { data, error } = comparisonResponses[i];
        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);
        results.push({
          title: `Comparison vs. ${competitorFiles[i].name.split('.').slice(0, -1).join('.')}`,
          content: data.comparison,
        });
      }
      setComparisonResults(results);

      const combinedComparison = results.map(r => `## ${r.title}\n\n${r.content}`).join("\n\n---\n\n");
      await generateTitleAndSave(userAnalysisResult, combinedComparison);

    } catch (err) {
      console.error("Screenshot comparison failed:", err);
      showError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
      setAnalysisType(null);
      dismissToast(toastId);
    }
  };

  const handleAutoAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }

    setIsLoading(true);
    setAnalysisType("auto");
    const toastId = showLoading("Starting automated analysis...");

    try {
      setLoadingMessage("Identifying app and top competitors...");
      const formData = new FormData();
      formData.append("file", uploadedFile);
      const { data, error } = await supabase.functions.invoke("auto-compare-analysis", {
        body: formData,
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const { userAnalysis: userResult, comparison: comparisonText } = data;
      setUserAnalysis(userResult);
      setComparisonResults([{ title: "Automated Competitive Comparison", content: comparisonText }]);
      showSuccess("Automated comparison complete.");

      await generateTitleAndSave(userResult, comparisonText);
    } catch (err) {
      console.error("Automated analysis failed:", err);
      showError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
      setAnalysisType(null);
      dismissToast(toastId);
    }
  };

  const generateTitleAndSave = async (userResult: string, comparison: string) => {
    setLoadingMessage("Generating title and saving...");
    const { data: titleData, error: titleError } = await supabase.functions.invoke("generate-title", {
      body: { analysis: userResult },
    });
    if (titleError || titleData.error) {
      console.error("Failed to generate title:", titleError || titleData.error);
      showError("Failed to generate a title for the history entry.");
      return;
    }
    
    const { error: insertError } = await supabase
      .from("analysis_history")
      .insert({
        title: titleData.title,
        user_analysis: userResult,
        comparison_result: comparison,
      });
    if (insertError) throw insertError;

    showSuccess("Analysis complete and saved to history!");
  };

  const handleClearAll = () => {
    setUploadedFile(null);
    setCompetitorFiles([]);
    setUserAnalysis(null);
    setComparisonResults(null);
  };

  if (userAnalysis) {
    return (
      <div className="min-h-screen flex flex-col items-center bg-background text-foreground p-4 py-12">
        <div className="w-full max-w-3xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Analysis Results</h2>
            <Button variant="outline" onClick={handleClearAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Analyze Another
            </Button>
          </div>
          <Accordion type="single" collapsible defaultValue="item-0" className="w-full rounded-lg border px-4">
            <AccordionItem value="item-0">
              <AccordionTrigger>Your App's Analysis</AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{userAnalysis}</ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
            {comparisonResults?.map((comp, index) => (
              <AccordionItem value={`item-${index + 1}`} key={index}>
                <AccordionTrigger>{comp.title}</AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{comp.content}</ReactMarkdown>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="absolute top-4 right-16 flex items-center gap-2">
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
          Upload a screenshot of your app to get started.
        </p>

        <div className="flex flex-col items-center gap-6">
          <FileUpload onFileChange={handleFileChange} />
          <MultiFileUpload onFilesChange={handleCompetitorFilesChange} />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
            <Button
              size="lg"
              onClick={handleCompareScreenshots}
              disabled={!uploadedFile || competitorFiles.length === 0 || isLoading}
            >
              {isLoading && analysisType === 'screenshot' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {loadingMessage || "Comparing..."}
                </>
              ) : (
                "Compare Screenshots"
              )}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={handleAutoAnalyze}
              disabled={!uploadedFile || isLoading}
            >
              {isLoading && analysisType === 'auto' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {loadingMessage || "Analyzing..."}
                </>
              ) : (
                "Analyze vs. Top 3"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;