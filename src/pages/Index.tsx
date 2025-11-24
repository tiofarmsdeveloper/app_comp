"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  imageUrl: string;
}

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResult, setComparisonResult] = useState<string | null>(null);
  const [allCompetitors, setAllCompetitors] = useState<Competitor[]>([]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);

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
            
            let imageUrl = "/placeholder.svg";
            if (screenshots && screenshots.length > 0) {
              const { data: { publicUrl } } = supabase.storage.from('competitor_images').getPublicUrl(screenshots[0].image_path);
              imageUrl = publicUrl;
            }
            
            return { id: c.id, name: c.name, imageUrl };
          })
        );
        setAllCompetitors(competitorsWithUrls.filter(c => c.imageUrl !== "/placeholder.svg"));
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

  const handleSelectCompetitor = (competitorName: string) => {
    setSelectedCompetitors(prev => 
        prev.includes(competitorName)
            ? prev.filter(name => name !== competitorName)
            : [...prev, competitorName]
    );
  };

  const analyzeImage = async (file: File, fileName: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data, error } = await supabase.functions.invoke("analyze-image", { body: formData });
    if (error) throw new Error(`Analysis failed for ${fileName}: ${error.message}`);
    if (data.error) throw new Error(`Analysis failed for ${fileName}: ${data.error}`);
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
      const userResult = await analyzeImage(uploadedFile, uploadedFile.name);
      setUserAnalysis(userResult);
      showSuccess("Your screenshot analysis is complete.");

      let finalComparisonResult: string;

      if (selectedCompetitors.length > 0) {
        setLoadingMessage(`Analyzing ${selectedCompetitors.length} competitors...`);
        const competitorsToAnalyze = allCompetitors.filter(c => selectedCompetitors.includes(c.name));
        
        const competitorPromises = competitorsToAnalyze.map(async (competitor) => {
          const response = await fetch(competitor.imageUrl);
          if (!response.ok) throw new Error(`Failed to fetch ${competitor.name} screenshot.`);
          const blob = await response.blob();
          const file = new File([blob], competitor.name, { type: blob.type });
          const analysis = await analyzeImage(file, competitor.name);
          return { name: competitor.name, analysis };
        });

        const competitorResults = await Promise.all(competitorPromises);
        
        setLoadingMessage("Comparing against competitors...");
        const { data: comparisonData, error: comparisonError } = await supabase.functions.invoke("compare-analyses", {
          body: { userAnalysis: userResult, competitorAnalyses: competitorResults },
        });
        if (comparisonError) throw new Error(comparisonError.message);
        if (comparisonData.error) throw new Error(comparisonData.error);
        finalComparisonResult = comparisonData.comparison;

      } else {
        setLoadingMessage("Generating general analysis...");
        const { data, error } = await supabase.functions.invoke("generate-generic-analysis", {
            body: { userAnalysis: userResult }
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        finalComparisonResult = data.analysis;
      }
      
      setComparisonResult(finalComparisonResult);
      
      setLoadingMessage("Generating title...");
      const { data: titleData, error: titleError } = await supabase.functions.invoke("generate-title", { body: { analysis: userResult } });
      if (titleError) throw new Error(titleError.message);
      if (titleData.error) throw new Error(titleData.error);
      const title = titleData.title;

      setLoadingMessage("Saving to history...");
      await supabase.from("analysis_history").insert({
        title: title,
        user_analysis: userResult,
        comparison_result: finalComparisonResult,
      });

      showSuccess("Analysis complete and saved to history!");
    } catch (err) {
      console.error("Full analysis process failed:", err);
      showError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
      dismissToast(toastId);
    }
  };

  const handleClear = () => {
    setUploadedFile(null);
    setUserAnalysis(null);
    setComparisonResult(null);
    setSelectedCompetitors([]);
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
          <Link to="/history"><History className="h-5 w-5" /></Link>
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings"><Settings className="h-5 w-5" /></Link>
        </Button>
      </div>
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">Sinder Competitor Analysis Tool</h1>
        <p className="text-lg text-muted-foreground mb-8">Upload a screenshot of a mobile app to get started.</p>

        <div className="flex flex-col items-center gap-6">
          <FileUpload onFileChange={handleFileChange} />

          {uploadedFile && (
            <Card className="w-full max-w-lg text-left">
              <CardHeader>
                <CardTitle>Select Competitors</CardTitle>
                <CardDescription>Choose who to compare against, or get a general analysis.</CardDescription>
              </CardHeader>
              <CardContent>
                {allCompetitors.length > 0 ? (
                  <div className="space-y-3">
                    {allCompetitors.map(c => (
                      <div key={c.id} className="flex items-center space-x-3">
                        <Checkbox 
                          id={c.id} 
                          checked={selectedCompetitors.includes(c.name)}
                          onCheckedChange={() => handleSelectCompetitor(c.name)}
                        />
                        <label htmlFor={c.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {c.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No competitors added. Add some in Settings for direct comparison.</p>
                )}
              </CardContent>
            </Card>
          )}

          <Button size="lg" onClick={handleAnalyze} disabled={!uploadedFile || isLoading} className="w-full max-w-lg">
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{loadingMessage || "Analyzing..."}</>
            ) : selectedCompetitors.length > 0 ? (
              `Analyze Against ${selectedCompetitors.length} Competitor(s)`
            ) : (
              "Get General AI Analysis"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;