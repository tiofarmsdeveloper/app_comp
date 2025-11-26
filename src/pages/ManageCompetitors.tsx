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
import { Trash2, PlusCircle, Image as ImageIcon } from "lucide-react";
import { Header } from "@/components/Header";

interface Competitor {
  id: string;
  name: string;
  primary_screenshot_path: string | null;
  imageUrl?: string;
}

const ManageCompetitors = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [newCompetitorFile, setNewCompetitorFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(Date.now());

  const fetchCompetitors = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("competitors")
      .select("id, name, primary_screenshot_path")
      .order("created_at", { ascending: true });

    if (error) {
      showError("Failed to fetch competitors.");
      console.error(error);
      setCompetitors([]);
    } else {
      const competitorsWithUrls = data.map(c => {
        let publicUrl = '';
        if (c.primary_screenshot_path) {
          const result = supabase.storage.from('competitor_screenshots').getPublicUrl(c.primary_screenshot_path);
          publicUrl = result.data.publicUrl;
        }
        return { ...c, imageUrl: publicUrl };
      });
      setCompetitors(competitorsWithUrls);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setNewCompetitorFile(e.target.files[0]);
    }
  };

  const handleAddCompetitor = async () => {
    if (!newCompetitorName || !newCompetitorFile) {
      showError("Please provide a name and select a file.");
      return;
    }

    setIsUploading(true);
    const toastId = showLoading("Adding competitor...");

    try {
      const filePath = `public/${Date.now()}-${newCompetitorFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("competitor_screenshots")
        .upload(filePath, newCompetitorFile);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("competitors")
        .insert({ name: newCompetitorName, primary_screenshot_path: filePath });

      if (insertError) throw insertError;

      showSuccess("Competitor added successfully!");
      setNewCompetitorName("");
      setNewCompetitorFile(null);
      setFileInputKey(Date.now()); // Reset the file input
      
      fetchCompetitors(); // Refresh the list
    } catch (err) {
      console.error("Failed to add competitor:", err);
      showError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      dismissToast(toastId);
      setIsUploading(false);
    }
  };

  const handleDeleteCompetitor = async (competitor: Competitor) => {
    const toastId = showLoading(`Deleting ${competitor.name}...`);
    try {
      const { error: deleteError } = await supabase
        .from("competitors")
        .delete()
        .eq("id", competitor.id);
      
      if (deleteError) throw deleteError;

      if (competitor.primary_screenshot_path) {
        const { error: storageError } = await supabase.storage
          .from("competitor_screenshots")
          .remove([competitor.primary_screenshot_path]);

        if (storageError) throw storageError;
      }

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
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Manage Competitors</CardTitle>
            <CardDescription>
              Add or remove competitors for the analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Add New Competitor</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="competitor-name">Competitor Name</Label>
                  <Input
                    id="competitor-name"
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="e.g., Revolut"
                    disabled={isUploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="competitor-file">Screenshot</Label>
                  <Input key={fileInputKey} id="competitor-file" type="file" onChange={handleFileChange} accept="image/png, image/jpeg" disabled={isUploading} />
                </div>
                <Button onClick={handleAddCompetitor} disabled={isUploading}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Current Competitors</h3>
              <div className="space-y-3">
                {isLoading ? (
                  [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : competitors.length > 0 ? (
                  competitors.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.name} className="h-10 w-10 object-contain rounded-md bg-muted" />
                        ) : (
                          <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-md">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
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