"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  showSuccess,
  showError,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import { Loader2, ArrowLeft, Trash2, PlusCircle } from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FileUpload } from "@/components/FileUpload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const competitorSchema = z.object({
  name: z.string().min(1, "Competitor name is required."),
  screenshot: z.instanceof(File).refine((file) => file, "Screenshot is required."),
});

type CompetitorFormValues = z.infer<typeof competitorSchema>;

interface Competitor {
  id: string;
  name: string;
  primary_screenshot_path: string | null;
}

const Settings = () => {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isCompetitorLoading, setIsCompetitorLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const form = useForm<CompetitorFormValues>({
    resolver: zodResolver(competitorSchema),
    defaultValues: {
      name: "",
      screenshot: undefined,
    },
  });

  const fetchCompetitors = async () => {
    setIsCompetitorLoading(true);
    const { data, error } = await supabase
      .from("competitors")
      .select("id, name, primary_screenshot_path");

    if (error) {
      showError("Failed to fetch competitors.");
      console.error(error);
    } else {
      setCompetitors(data);
    }
    setIsCompetitorLoading(false);
  };

  useEffect(() => {
    const fetchCurrentModel = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "gemini_model")
        .single();

      if (error && error.code !== "PGRST116") {
        showError(error.message);
      } else if (data?.value) {
        setCurrentModel(data.value);
        setSelectedModel(data.value);
      }
      setIsLoading(false);
    };

    fetchCurrentModel();
    fetchCompetitors();
  }, []);

  const handleFetchModels = async () => {
    setIsFetching(true);
    const toastId = showLoading("Fetching available models...");
    try {
      const { data, error } = await supabase.functions.invoke("list-models");
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      setModels(data.models || []);
      showSuccess("Successfully fetched models.");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to fetch models.",
      );
    } finally {
      dismissToast(toastId);
      setIsFetching(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedModel) {
      showError("Please select a model first.");
      return;
    }
    setIsLoading(true);
    const toastId = showLoading("Saving settings...");
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ key: "gemini_model", value: selectedModel });
      if (error) throw error;
      setCurrentModel(selectedModel);
      showSuccess("Settings saved successfully!");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      dismissToast(toastId);
      setIsLoading(false);
    }
  };

  const onSubmit: SubmitHandler<CompetitorFormValues> = async (values) => {
    const toastId = showLoading("Adding new competitor...");
    try {
      const file = values.screenshot;
      const filePath = `public/${Date.now()}-${file.name}`;

      // 1. Upload screenshot
      const { error: uploadError } = await supabase.storage
        .from("competitor_screenshots")
        .upload(filePath, file);
      if (uploadError) throw new Error(`Storage error: ${uploadError.message}`);

      // 2. Insert competitor with screenshot path
      const { data: competitorData, error: competitorError } = await supabase
        .from("competitors")
        .insert({
          name: values.name,
          primary_screenshot_path: filePath,
        })
        .select()
        .single();
      if (competitorError) throw new Error(`Database error: ${competitorError.message}`);
      
      // 3. Insert into screenshots table for consistency
      const { error: screenshotError } = await supabase
        .from("competitor_screenshots")
        .insert({
          competitor_id: competitorData.id,
          image_path: filePath,
        });
      if (screenshotError) throw new Error(`Screenshot table error: ${screenshotError.message}`);

      showSuccess("Competitor added successfully!");
      form.reset();
      setIsFormOpen(false);
      fetchCompetitors(); // Refresh list
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add competitor.");
    } finally {
      dismissToast(toastId);
    }
  };

  const handleDeleteCompetitor = async (competitor: Competitor) => {
    const toastId = showLoading(`Deleting ${competitor.name}...`);
    try {
      // 1. Delete from storage if path exists
      if (competitor.primary_screenshot_path) {
        const { error: storageError } = await supabase.storage
          .from("competitor_screenshots")
          .remove([competitor.primary_screenshot_path]);
        if (storageError) {
          console.warn(`Could not delete file from storage, but proceeding: ${storageError.message}`);
        }
      }
      
      // 2. Delete from database (will cascade)
      const { error: dbError } = await supabase
        .from("competitors")
        .delete()
        .eq("id", competitor.id);
      if (dbError) throw dbError;

      showSuccess(`${competitor.name} deleted.`);
      fetchCompetitors(); // Refresh list
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete competitor.");
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-2xl space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="mr-2" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="flex-grow">
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  Configure the AI model for analysis.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Model</Label>
              <p className="text-sm text-muted-foreground h-6">
                {isLoading ? "Loading..." : currentModel || "Not set"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-select">Gemini AI Model</Label>
              <div className="flex gap-2">
                <Select
                  onValueChange={setSelectedModel}
                  value={selectedModel || ""}
                  disabled={models.length === 0}
                >
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleFetchModels}
                  variant="outline"
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Fetch"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleSaveSettings}
              disabled={isLoading || !selectedModel}
              className="w-full"
            >
              {isLoading && !isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Settings
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Competitor Management</CardTitle>
                <CardDescription>
                  Add or remove competitors for analysis.
                </CardDescription>
              </div>
              <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Competitor
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Competitor</DialogTitle>
                    <DialogDescription>
                      Upload a primary screenshot for the new competitor.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-6"
                    >
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Competitor Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Revolut" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="screenshot"
                        render={() => (
                          <FormItem>
                            <FormLabel>Screenshot</FormLabel>
                            <FormControl>
                              <FileUpload
                                onFileChange={(file) => {
                                  form.setValue("screenshot", file as File, {
                                    shouldValidate: true,
                                  });
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          "Add Competitor"
                        )}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isCompetitorLoading ? (
              <p>Loading competitors...</p>
            ) : (
              <ul className="space-y-2">
                {competitors.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between p-2 border rounded-md"
                  >
                    <span className="font-medium">{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCompetitor(c)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;