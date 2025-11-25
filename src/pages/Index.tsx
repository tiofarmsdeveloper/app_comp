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
import { Loader2, Settings, History, RefreshCw, Image as ImageIcon } from "lucide-react";

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
            const { data: { publicUrl } } = supabase.storage.from('competitor_screenshots').getPublicUrl(c.primary_screenshot_path);
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
      const userAnalysisResult = await analyzeImage(uploadedFile);
      setUserAnalysis(userAnalysisResult);

      setLoadingMessage(`Analyzing ${savedCompetitors.length} saved competitor(s)...`);
      const competitorAnalyses = await Promise.all(
        savedCompetitors.map(async (competitor) => {
          const response = await fetch(competitor.imageUrl);
          if (!response.ok) throw new Error(`Failed to fetch image for ${competitor.name}`);
          const blob = await response.blob();
          const file = new File([blob], competitor.name, { type: blob.type });
          const analysis = await analyzeImage(file);
          return { name: competitor.name, analysis };
        })
      );

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 pt-20 sm:pt-4">
      <div className="absolute top-4 right-16 flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/history"><History className="h-5 w-5" /></Link></Button>
        <Button variant="ghost" size="icon" asChild><Link to="/settings"><Settings className="h-5 w-5" /></Link></Button>
      </div>
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">Sinder Competitor Analysis Tool</h1>
        <p className="text-lg text-muted-foreground mb-8">Upload a screenshot of your app to get started.</p>

        <div className="flex flex-col items-center gap-6">
          <FileUpload onFileChange={handleFileChange} />

          <div className="w-full max-w-lg space-y-2">
            <Label htmlFor="analysis-mode">Analysis Mode</Label>
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

          {analysisMode === 'screenshot' && <MultiFileUpload onFilesChange={handleCompetitorFilesChange} />}
          {analysisMode === 'saved' && (
            <div className="w-full max-w-lg p-4 border rounded-lg bg-muted/50 text-left">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Comparing against your saved list:</h3>
              <div className="space-y-2">
                {isFetchingCompetitors ? (
                  [...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
                ) : savedCompetitors.length > 0 ? (
                  savedCompetitors.map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-2 bg-background rounded-md">
                      <img src={c.imageUrl} alt={c.name} className="h-8 w-8 object-contain rounded-sm bg-white" />
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
    </div>
  );
};

export default Index;