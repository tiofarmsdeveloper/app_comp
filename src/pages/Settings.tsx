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
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { Loader2, Users } from "lucide-react";
import { Header } from "@/components/Header";

const Settings = () => {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [sinderDescription, setSinderDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["gemini_model", "sinder_description"]);

      if (error) {
        console.error("Error fetching settings:", error);
        showError(error.message);
      } else {
        const modelSetting = data.find(d => d.key === 'gemini_model');
        if (modelSetting) {
          setCurrentModel(modelSetting.value);
          setSelectedModel(modelSetting.value);
        }
        const descSetting = data.find(d => d.key === 'sinder_description');
        if (descSetting) {
          setSinderDescription(descSetting.value);
        }
      }
      setIsLoading(false);
    };

    fetchSettings();
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
      console.error("Failed to fetch models:", err);
      showError(err instanceof Error ? err.message : "Failed to fetch models.");
    } finally {
      dismissToast(toastId);
      setIsFetching(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    const toastId = showLoading("Saving settings...");
    try {
      const settingsToUpdate = [];
      if (selectedModel) {
        settingsToUpdate.push({ key: "gemini_model", value: selectedModel });
      }
      settingsToUpdate.push({ key: "sinder_description", value: sinderDescription });

      const { error } = await supabase
        .from("settings")
        .upsert(settingsToUpdate);

      if (error) throw error;

      if (selectedModel) setCurrentModel(selectedModel);
      showSuccess("Settings saved successfully!");
    } catch (err) {
      console.error("Failed to save settings:", err);
      showError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      dismissToast(toastId);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-background text-foreground">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4 w-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Configure the AI model and manage competitors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold">Sinder App Description</h3>
              <div className="space-y-2">
                <Label htmlFor="sinder-description">
                  Provide a brief description of your app for the AI.
                </Label>
                <Textarea
                  id="sinder-description"
                  placeholder="e.g., Sinder is a mobile banking app for students, focusing on budgeting and savings goals..."
                  value={sinderDescription}
                  onChange={(e) => setSinderDescription(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold">AI Model Configuration</h3>
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
                  <Button onClick={handleFetchModels} variant="outline" disabled={isFetching}>
                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
              </div>
            </div>
            
            <Link to="/settings/competitors" className="w-full">
              <Button variant="outline" className="w-full">
                <Users className="mr-2 h-4 w-4" />
                Manage Competitors
              </Button>
            </Link>

          </CardContent>
          <CardFooter>
            <Button onClick={handleSave} disabled={isLoading} className="w-full">
              {isLoading && !isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Settings
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
};

export default Settings;