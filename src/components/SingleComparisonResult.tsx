import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StarRating } from "./StarRating";
import { Separator } from "./ui/separator";
import { CheckCircle2, XCircle, Target } from "lucide-react";
import { ComparisonSlider } from "./ComparisonSlider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from "react-markdown";

export interface ComparisonData {
  competitor_name: string;
  comparison_summary: string;
  user_app_rating: number;
  competitor_app_rating: number;
  user_app_strengths: string[];
  competitor_app_strengths: string[];
  actionable_recommendations: string[];
  competitor_analysis_markdown: string;
}

interface SingleComparisonResultProps {
  data: ComparisonData;
}

export const SingleComparisonResult = ({ data }: SingleComparisonResultProps) => {
  return (
    <Card className="w-full max-w-2xl text-left mt-6">
      <CardHeader>
        <CardTitle>Comparison vs. {data.competitor_name}</CardTitle>
        <CardDescription>{data.comparison_summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ratings & Slider */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="flex flex-col items-center p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">Your App</h4>
              <StarRating rating={data.user_app_rating} />
              <p className="text-sm text-muted-foreground mt-1">
                {data.user_app_rating.toFixed(1)} / 5.0
              </p>
            </div>
            <div className="flex flex-col items-center p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">{data.competitor_name}</h4>
              <StarRating rating={data.competitor_app_rating} />
              <p className="text-sm text-muted-foreground mt-1">
                {data.competitor_app_rating.toFixed(1)} / 5.0
              </p>
            </div>
          </div>
          <ComparisonSlider
            userRating={data.user_app_rating}
            competitorRating={data.competitor_app_rating}
            competitorName={data.competitor_name}
          />
        </div>

        <Separator />

        {/* Strengths Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
              Your App's Strengths
            </h4>
            <ul className="list-none space-y-2 pl-0">
              {data.user_app_strengths.map((strength, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">✓</span>
                  <span className="text-sm">{strength}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center">
              <XCircle className="h-5 w-5 mr-2 text-red-500" />
              {data.competitor_name}'s Strengths
            </h4>
            <ul className="list-none space-y-2 pl-0">
              {data.competitor_app_strengths.map((strength, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-red-500 mr-2 mt-1">✓</span>
                  <span className="text-sm">{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator />

        {/* Recommendations */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center">
            <Target className="h-5 w-5 mr-2 text-primary" />
            Actionable Recommendations
          </h4>
          <ul className="list-none space-y-2 pl-0">
            {data.actionable_recommendations.map((rec, i) => (
              <li key={i} className="flex items-start">
                <span className="text-primary mr-2 mt-1">→</span>
                <span className="text-sm">{rec}</span>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {/* Full Competitor Analysis */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>
              View Full AI Analysis for {data.competitor_name}
            </AccordionTrigger>
            <AccordionContent>
              <div className="prose prose-sm dark:prose-invert max-w-none pt-2">
                <ReactMarkdown>
                  {data.competitor_analysis_markdown}
                </ReactMarkdown>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};