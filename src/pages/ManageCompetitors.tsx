"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  showSuccess,
  showError,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { Trash2, PlusCircle, Users } from "lucide-react";
import { Header } from "@/components/Header";

interface Competitor {
  id: string;
  name: string;
}

const ManageCompetitors = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState("");

  const fetchCompetitors = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("competitors")
      .select("id, name")
      .order("created_at", { ascending: true });

    if (error) {
      showError("Failed to fetch competitors.");
      console.error(error);
      setCompetitors([]);
    } else {
      setCompetitors(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const handleAddCompetitor = async () => {
    if (!newCompetitorName) {
      showError("Please provide a competitor name.");
      return;
    }

    setIsSubmitting(true);
    const toastId = showLoading("Adding competitor...");

    try {
      const { error } = await supabase
        .from("competitors")
        .insert({ name: newCompetitorName });

      if (error) throw error;

      showSuccess("Competitor added successfully!");
      setNewCompetitorName("");
      fetchCompetitors(); // Refresh the list
    } catch (err) {
      console.error("Failed to add competitor:", err);
      showError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompetitor = async (competitor: Competitor) => {
    const toastId = showLoading(`Deleting ${competitor.name}...`);
    try {
      const { error } = await supabase
        .from("competitors")
        .delete()
        .eq("id", competitor.id);
      
      if (error) throw error;

      showSuccess("Competitor deleted.");
      setCompetitors(competitors.filter(c => c.id !== competitor.id));
    } catch (err) {
      console.error("Failed to delete competitor:", err);
      showError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-background text-foreground">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4 w-full">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Manage Competitors</CardTitle>
            <CardDescription>
              Add or remove competitors for the analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Add New Competitor</h3>
              <div className="flex gap-4 items-end">
                <div className="space-y-2 flex-grow">
                  <Label htmlFor="competitor-name">Competitor Name</Label>
                  <Input
                    id="competitor-name"
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="e.g., Revolut"
                    disabled={isSubmitting}
                  />
                </div>
                <Button onClick={handleAddCompetitor} disabled={isSubmitting}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Current Competitors</h3>
              <div className="space-y-3">
                {isLoading ? (
                  [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : competitors.length > 0 ? (
                  competitors.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{c.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCompetitor(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No competitors added yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ManageCompetitors;