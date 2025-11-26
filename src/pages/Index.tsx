"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { FileUpload } from "@/components/FileUpload";
import { MultiFileUpload } from "@/components/MultiFileUpload";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Loader2, RefreshCw, Image as ImageIcon } from "lucide-react";
import { Header } from "@/components/Header";

type AnalysisMode = "auto" | "screenshot" | "saved";

interface Comparison {
  title: string;
  content: string;
}

interface SavedCompetitor {
  id: string;
  name: string;
  imageUrl: string;
}

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [competitorFiles, setCompetitorFiles] = useState<File[]>([]);
  const [savedCompetitors, setSavedCompetitors] = useState<SavedCompetitor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCompetitors, setIsFetchingCompetitors] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<Comparison[] | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("auto");

  useEffect(() => {
    if (analysisMode === "saved") {
      const fetchCompetitors = async () => {
        setIsFetchingCompetitors(true);
        const { data, error } = await supabase
          .from("competitors")
          .select("id, name, primary_screenshot_path");

        if (error) {
          showError("Failed to fetch saved competitors.");
          console.error(error);
        } else {
          const competitorsWithUrls = data.map(c => {
            let publicUrl = '';
            if (c.primary_screenshot_path) {
              const { data: { publicUrl: url } } = supabase.storage.from('competitor_screenshots').getPublicUrl(c.primary_screenshot_path);
              publicUrl = url;
            }
            return { id: c.id, name: c.name, imageUrl: publicUrl };
          });
          setSavedCompetitors(competitorsWithUrls);
        }
        setIsFetchingCompetitors(false);
      };
      fetchCompetitors();
    }
  }, [analysisMode]);

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

  const handleCompareScreenshots = async () => {
    if (!uploadedFile || competitorFiles.length === 0) {
      showError("Please upload your app's screenshot and at least one competitor screenshot.");
      return;
    }
    
    const toastId = showLoading("Starting analysis...");
    try {
      setLoadingMessage(`Comparing against ${competitorFiles.length} competitor(s)...`);

      let userAnalysisResult: string | null = null;
      const results: Comparison[] = [];

      for (let i = 0; i < competitorFiles.length; i++) {
        const competitorFile = competitorFiles[i];
        setLoadingMessage(`Analyzing vs. ${competitorFile.name}...`);

        const formData = new FormData();
        formData.append("userFile", uploadedFile);
        formData.append("competitorFile", competitorFile);
        formData.append("competitorName", competitorFile.name);

        const { data, error } = await supabase.functions.invoke("direct-compare-screenshots", {
          body: formData,
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);

        if (!userAnalysisResult) {
          userAnalysisResult = data.userAnalysis;
          setUserAnalysis(userAnalysisResult);
        }

        results.push({
          title: `Comparison vs. ${competitorFile.name.split('.').slice(0, -1).join('.')}`,
          content: data.comparison,
        });
      }
      
      setComparisonResults(results);

      if (userAnalysisResult) {
        const combinedComparison = results.map(r => `## ${r.title}\n\n${r.content}`).join("\n\n---\n\n");
        await generateTitleAndSave(userAnalysisResult, combinedComparison);
      } else {
        throw new Error("Failed to get user analysis from the comparison function.");
      }
    } catch (err) {
      handleError(err, "Screenshot comparison failed.");
    } finally {
      dismissToast(toastId);
    }
  };

  const handleAutoAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }
    const toastId = showLoading("Starting automated analysis...");
    try {
      setLoadingMessage("Identifying app and top competitors...");
      const formData = new FormData();
      formData.append("file", uploadedFile);
      const { data, error } = await supabase.functions.invoke("auto-compare-analysis", { body: formData });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const { userAnalysis: userResult, comparison: comparisonText } = data;
      setUserAnalysis(userResult);
      setComparisonResults([{ title: "Automated Competitive Comparison", content: comparisonText }]);
      
      await generateTitleAndSave(userResult, comparisonText);
    } catch (err) {
      handleError(err, "Automated analysis failed.");
    } finally {
      dismissToast(toastId);
    }
  };

  const handleCompareSaved = async () => {
    if (!uploadedFile || savedCompetitors.length === 0) {
      showError("Please upload a screenshot and ensure you have saved competitors in settings.");
      return;
    }
    const toastId = showLoading("Starting analysis...");
    try {
      setLoadingMessage("Analyzing your screenshot...");
      const { data: userAnalysisData, error: userAnalysisError } = await supabase.functions.invoke("analyze-image", {
        body: (() => { const fd = new FormData(); fd.append("file", uploadedFile); return fd; })(),
      });
      if (userAnalysisError) throw new Error(userAnalysisError.message);
      if (userAnalysisData.error) throw new Error(userAnalysisData.error);
      const userAnalysisResult = userAnalysisData.analysis;
      setUserAnalysis(userAnalysisResult);

      setLoadingMessage(`Analyzing ${savedCompetitors.length} saved competitor(s)...`);
      
      const competitorsWithScreenshot = savedCompetitors.filter(c => c.imageUrl);
      const competitorsWithoutScreenshot = savedCompetitors.filter(c => !c.imageUrl);

      const analysesWithScreenshot = await Promise.all(
        competitorsWithScreenshot.map(async (competitor) => {
          const response = await fetch(competitor.imageUrl);
          if (!response.ok) throw new Error(`Failed to fetch image for ${competitor.name}`);
          const blob = await response.blob();
          const file = new File([blob], competitor.name, { type: blob.type });
          
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-image", {
            body: (() => { const fd = new FormData(); fd.append("file", file); return fd; })(),
          });
          if (analysisError) throw new Error(analysisError.message);
          if (analysisData.error) throw new Error(analysisData.error);

          return { name: competitor.name, analysis: analysisData.analysis };
        })
      );

      const analysesWithoutScreenshot = await Promise.all(
        competitorsWithoutScreenshot.map(async (competitor) => {
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke("generate-analysis-from-name", {
            body: { competitorName: competitor.name },
          });
          if (analysisError) throw new Error(analysisError.message);
          if (analysisData.error) throw new Error(analysisData.error);

          return { name: competitor.name, analysis: analysisData.analysis };
        })
      );

      const competitorAnalyses = [...analysesWithScreenshot, ...analysesWithoutScreenshot];

      setLoadingMessage("Generating comparison...");
      const { data, error } = await supabase.functions.invoke("compare-analyses", {
        body: { userAnalysis: userAnalysisResult, competitorAnalyses },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      setComparisonResults([{ title: "Comparison vs. Saved List", content: data.comparison }]);
      await generateTitleAndSave(userAnalysisResult, data.comparison);
    } catch (err) {
      handleError(err, "Analysis against saved list failed.");
    } finally {
      dismissToast(toastId);
    }
  };

  const handleStartAnalysis = () => {
    setIsLoading(true);
    setComparisonResults(null);
    setUserAnalysis(null);

    if (analysisMode === 'auto') {
      handleAutoAnalyze();
    } else if (analysisMode === 'screenshot') {
      handleCompareScreenshots();
    } else if (analysisMode === 'saved') {
      handleCompareSaved();
    }
  };

  const handleError = (err: unknown, message: string) => {
    console.error(message, err);
    showError(err instanceof Error ? err.message : message);
    setIsLoading(false);
    setLoadingMessage("");
  };

  const generateTitleAndSave = async (userResult: string, comparison: string) => {
    setLoadingMessage("Generating title and saving...");
    const { data: titleData, error: titleError } = await supabase.functions.invoke("generate-title", {
      body: { analysis: userResult },
    });
    if (titleError || titleData.error) {
      throw new Error("Failed to generate a title for the history entry.");
    }
    
    const { error: insertError } = await supabase.from("analysis_history").insert({
      title: titleData.title,
      user_analysis: userResult,
      comparison_result: comparison,
    });
    if (insertError) throw insertError;

    showSuccess("Analysis complete and saved to history!");
    setIsLoading(false);
    setLoadingMessage("");
  };

  const handleClearAll = () => {
    setUploadedFile(null);
    setCompetitorFiles([]);
    setUserAnalysis(null);
    setComparisonResults(null);
  };

  if (userAnalysis) {
    return (
      <div className="min-h-screen flex flex-col items-center bg-background text-foreground">
        <Header />
        <main className="w-full max-w-3xl p-4">
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
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">Sinder Competitor Analysis Tool</h1>
          <p className="text-lg text-muted-foreground mb-8">Upload a screenshot of your app to get started.</p>

          <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-lg space-y-3 text-left">
              <Label className="text-base font-semibold">1. Upload Your App Screenshot (Sinder)</Label>
              <FileUpload onFileChange={handleFileChange} id="sinder-upload" />
            </div>

            <div className="w-full max-w-lg space-y-3 text-left">
              <Label htmlFor="analysis-mode" className="text-base font-semibold">2. Choose Analysis Mode</Label>
              <Select value={analysisMode} onValueChange={(v) => setAnalysisMode(v as AnalysisMode)}>
                <SelectTrigger id="analysis-mode">
                  <SelectValue placeholder="Select analysis mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Compare vs. Top 3 (Auto)</SelectItem>
                  <SelectItem value="screenshot">Compare vs. Screenshots</SelectItem>
                  <SelectItem value="saved">Compare vs. My Saved List</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {analysisMode === 'screenshot' && (
              <div className="w-full max-w-lg space-y-3 text-left">
                <Label className="text-base font-semibold">3. Upload Competitor Screenshots</Label>
                <MultiFileUpload onFilesChange={handleCompetitorFilesChange} id="competitor-upload" />
              </div>
            )}
            {analysisMode === 'saved' && (
              <div className="w-full max-w-lg p-4 border rounded-lg bg-muted/50 text-left">
                <h3 className="text-base font-semibold mb-3">3. Comparing Against Your Saved List</h3>
                <div className="space-y-2">
                  {isFetchingCompetitors ? (
                    [...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
                  ) : savedCompetitors.length > 0 ? (
                    savedCompetitors.map(c => (
                      <div key={c.id} className="flex items-center gap-3 p-2 bg-background rounded-md">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.name} className="h-8 w-8 object-contain rounded-sm bg-white" />
                        ) : (
                          <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-sm flex-shrink-0">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No competitors found. <Link to="/settings/competitors" className="underline">Add some in settings.</Link></p>
                  )}
                </div>
              </div>
            )}
            
            <div className="w-full max-w-lg">
              <Button size="lg" onClick={handleStartAnalysis} disabled={!uploadedFile || isLoading} className="w-full">
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {loadingMessage || "Analyzing..."}</>
                ) : "Start Analysis"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;