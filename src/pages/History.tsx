"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History as HistoryIcon } from "lucide-react";
import { format } from "date-fns";
import { Header } from "@/components/Header";

interface HistoryItem {
  id: string;
  title: string;
  created_at: string;
}

const History = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("analysis_history")
        .select("id, title, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching history:", error);
      } else {
        setHistory(data);
      }
      setIsLoading(false);
    };

    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center bg-background text-foreground">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4 w-full">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Analysis History</CardTitle>
            <CardDescription>
              Review your past analysis reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : history.length > 0 ? (
              <ul className="space-y-3">
                {history.map((item) => (
                  <li key={item.id}>
                    <Link to={`/history/${item.id}`}>
                      <div className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(item.created_at), "MMMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-12">
                <HistoryIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-medium text-foreground">No history yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your analysis reports will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default History;