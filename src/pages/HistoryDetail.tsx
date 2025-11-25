"use client";

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AnalysisDetail {
  title: string;
  user_analysis: string;
  comparison_result: string;
}

const HistoryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!id) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from("analysis_history")
        .select("title, user_analysis, comparison_result")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching analysis detail:", error);
      } else {
        setAnalysis(data);
      }
      setIsLoading(false);
    };

    fetchAnalysis();
  }, [id]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-background text-foreground p-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="flex items-center mb-4">
          <Button variant="ghost" size="icon" className="mr-2" asChild>
            <Link to="/history">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          {isLoading ? (
            <Skeleton className="h-8 w-3/4" />
          ) : (
            <h1 className="text-2xl font-bold">{analysis?.title}</h1>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : analysis ? (
          <Accordion type="single" collapsible defaultValue="item-0" className="w-full rounded-lg border px-4">
            <AccordionItem value="item-0">
              <AccordionTrigger>Your App's Analysis</AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{analysis.user_analysis}</ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
            {analysis.comparison_result && (
              <AccordionItem value="item-1">
                <AccordionTrigger>Competitive Comparison</AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{analysis.comparison_result}</ReactMarkdown>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        ) : (
          <p>Analysis not found.</p>
        )}
      </div>
    </div>
  );
};

export default HistoryDetail;