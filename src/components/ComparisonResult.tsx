import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ComparisonResultProps {
  result: string;
}

export const ComparisonResult = ({ result }: ComparisonResultProps) => {
  return (
    <Card className="w-full max-w-2xl text-left mt-6">
      <CardHeader>
        <CardTitle>Competitive Comparison</CardTitle>
        <CardDescription>
          Actionable recommendations based on competitor analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {result}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
};