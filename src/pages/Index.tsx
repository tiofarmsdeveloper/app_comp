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
import { Separator } from "@/components/ui/separator";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { AnalysisResult } from "@/components/AnalysisResult";
import { SingleComparisonResult, ComparisonData } from "@/components/SingleComparisonResult";
import { Loader2, Settings, History } from "lucide-react";

interface Competitor {
  id: string;
  name: string;
}

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [userAnalysis, setUserAnalysis] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonData[]>([]);
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
        setAllCompetitors(competitorsData || []);
      }
    };
    fetchCompetitors();
  }, []);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
    if (userAnalysis || comparisonResults.length > 0) {
      setUserAnalysis(null);
      setComparisonResults([]);
    }
  };

  const handleSelectCompetitor = (competitorId: string) => {
    setSelectedCompetitors(prev => 
        prev.includes(competitorId)
            ? prev.filter(id => id !== competitorId)
            : [...prev, competitorId]
    );
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedCompetitors(allCompetitors.map(c => c.id));
    } else {
      setSelectedCompetitors([]);
    }
  };

  const analyzeImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data, error } = await supabase.functions.invoke("analyze-image", { body: formData });
    if (error) throw new Error(`Analysis failed: ${error.message}`);
    if (data.error) throw new Error(`Analysis failed: ${data.error}`);
    return data.analysis;
  };

  const formatResultsForHistory = (userAnalysis: string, comparisonResults: ComparisonData[]): string => {
    if (comparisonResults.length === 0) {
      return "No direct comparison was performed.";
    }
    
    let markdown = "";
    comparisonResults.forEach(result => {
      markdown += `## Comparison vs. ${result.competitor_name}\n\n`;
      markdown += `**Summary:** ${result.comparison_summary}\n\n`;
      markdown += `**Ratings:**\n- Your App: ${'★'.repeat(Math.round(result.user_app_rating))}${'☆'.repeat(5 - Math.round(result.user_app_rating))}\n`;
      markdown += `- ${result.competitor_name}: ${'★'.repeat(Math.round(result.competitor_app_rating))}${'☆'.repeat(5 - Math.round(result.competitor_app_rating))}\n\n`;
      markdown += `### Your App's Strengths\n`;
      result.user_app_strengths.forEach(s => markdown += `- ${s}\n`);
      markdown += `\n### ${result.competitor_name}'s Strengths\n`;
      result.competitor_app_strengths.forEach(s => markdown += `- ${s}\n`);
      markdown += `\n### Actionable Recommendations\n`;
      result.actionable_recommendations.forEach(r => markdown += `- ${r}\n`);
      markdown += `\n---\n\n`;
    });

    return markdown;
  };

  const handleAnalyze = async () => {
    if (!uploadedFile) {
      showError("Please upload a screenshot first.");
      return;
    }

    setIsLoading(true);
    const toastId = showLoading("Starting analysis...");
    const localComparisonResults: ComparisonData[] = [];

    try {
      setLoadingMessage(`Analyzing your screenshot...`);
      const userResult = await analyzeImage(uploadedFile);
      setUserAnalysis(userResult);
      dismissToast(toastId);
      showSuccess("Your screenshot analysis is complete.");

      if (selectedCompetitors.length > 0) {
        const competitorsToAnalyze = allCompetitors.filter(c => selectedCompetitors.includes(c.id));
        
        for (let i = 0; i < competitorsToAnalyze.length; i++) {
          const competitor = competitorsToAnalyze[i];
          setLoadingMessage(`Researching & comparing with ${competitor.name} (${i + 1}/${competitorsToAnalyze.length})...`);
          
          const { data: augmentData, error: augmentError } = await supabase.functions.invoke("augment-competitor-data", {
            body: { competitor_id: competitor.id }
          });

          if (augmentError) throw new Error(`Failed to research ${competitor.name}: ${augmentError.message}`);
          if (augmentData.error) throw new Error(`Failed to research ${competitor.name}: ${augmentData.error}`);
          
          const { data: comparisonData, error: comparisonError } = await supabase.functions.invoke("compare-single-competitor", {
            body: { 
              userAnalysis: userResult, 
              competitorAnalysis: augmentData.analysis,
              competitorName: competitor.name,
            },
          });
          if (comparisonError) throw new Error(comparisonError.message);
          if (comparisonData.error) throw new Error(comparisonData.error);

          localComparisonResults.push(comparisonData);
          setComparisonResults([...localComparisonResults]);
        }
      } else {
        showSuccess("General analysis will be available in history.");
      }
      
      setLoadingMessage("Generating title...");
      const { data: titleData, error: titleError } = await supabase.functions.invoke("generate-title", { body: { analysis: userResult } });
      if (titleError) throw new Error(titleError.message);
      if (titleData.error) throw new Error(titleData.error);
      const title = titleData.title;

      setLoadingMessage("Saving to history...");
      const comparisonMarkdown = formatResultsForHistory(userResult, localComparisonResults);
      await supabase.from("analysis_history").insert({
        title: title,
        user_analysis: userResult,
        comparison_result: comparisonMarkdown,
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
    setComparisonResults([]);
    setSelectedCompetitors([]);
  };

  if (userAnalysis) {
    return (
      <div className="min-h-screen flex flex-col items-center bg-background text-foreground p-4 py-12">
        <div className="w-full max-w-2xl">
          <AnalysisResult result={userAnalysis} onClear={handleClear} />
          {comparisonResults.map((result, index) => (
            <SingleComparisonResult key={index} data={result} />
          ))}
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
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="select-all"
                        checked={allCompetitors.length > 0 && selectedCompetitors.length === allCompetitors.length}
                        onCheckedChange={handleSelectAll}
                      />
                      <label
                        htmlFor="select-all"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 font-semibold"
                      >
                        Select All
                      </label>
                    </div>
                    <Separator className="my-2" />
                    {allCompetitors.map(c => (
                      <div key={c.id} className="flex items-center space-x-3">
                        <Checkbox 
                          id={c.id} 
                          checked={selectedCompetitors.includes(c.id)}
                          onCheckedChange={() => handleSelectCompetitor(c.id)}
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