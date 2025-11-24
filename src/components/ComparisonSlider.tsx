import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComparisonSliderProps {
  userRating: number;
  competitorRating: number;
  competitorName: string;
}

export const ComparisonSlider = ({ userRating, competitorRating, competitorName }: ComparisonSliderProps) => {
  // Normalize ratings to a 0-100 scale for the slider position
  const totalRating = userRating + competitorRating;
  // Handle division by zero if both ratings are 0
  const userAdvantagePercent = totalRating > 0 ? (userRating / totalRating) * 100 : 50;

  // Determine color based on who has the advantage
  const sliderColor = userAdvantagePercent > 51 ? "bg-green-500" : userAdvantagePercent < 49 ? "bg-red-500" : "bg-yellow-500";

  return (
    <div className="w-full px-4">
      <div className="flex justify-between items-center text-sm font-medium text-muted-foreground mb-2">
        <span>Your App</span>
        <span>{competitorName}</span>
      </div>
      <div className="relative h-3 w-full bg-muted rounded-full">
        <div
          className={cn("absolute h-3 rounded-full", sliderColor)}
          style={{ width: `${userAdvantagePercent}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
           <div className="h-5 w-5 bg-background rounded-full flex items-center justify-center border-2">
             <DollarSign className="h-3 w-3 text-foreground" />
           </div>
        </div>
      </div>
       <div className="text-center text-xs text-muted-foreground mt-2">
        {userAdvantagePercent > 51 ? "You have the advantage" : userAdvantagePercent < 49 ? `${competitorName} has the advantage` : "Closely matched"}
      </div>
    </div>
  );
};