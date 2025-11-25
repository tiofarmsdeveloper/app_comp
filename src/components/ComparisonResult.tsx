import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ReactMarkdown from "react-markdown";

interface ComparisonResultProps {
  title: string;
  result: string;
}

export const ComparisonResult = ({ title, result }: ComparisonResultProps) => {
  return (
    <Card className="w-full max-w-2xl text-left mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Actionable recommendations based on competitor analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
};