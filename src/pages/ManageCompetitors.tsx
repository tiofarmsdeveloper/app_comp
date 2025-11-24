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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  showSuccess,
  showError,
  showLoading,
  dismissToast,
} from "@/utils/toast";
import {
  ArrowLeft,
  Trash2,
  PlusCircle,
  Image as ImageIcon,
  Youtube,
  Sparkles,
  Loader2,
} from "lucide-react";

interface Screenshot {
  id: string;
  image_path: string;
  ai_title: string | null;
  imageUrl?: string;
}

interface Competitor {
  id: string;
  name: string;
  short_description: string | null;
  long_description: string | null;
  youtube_videos: string[] | null;
  screenshots: Screenshot[];
}

const ManageCompetitors = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCompetitorName, setNewCompetitorName] = useState("");

  const fetchCompetitors = async () => {
    setIsLoading(true);
    const { data: competitorsData, error } = await supabase
      .from("competitors")
      .select("id, name, short_description, long_description, youtube_videos")
      .order("created_at", { ascending: true });

    if (error) {
      showError("Failed to fetch competitors.");
      console.error(error);
      setCompetitors([]);
    } else {
      const competitorsWithDetails = await Promise.all(
        competitorsData.map(async (c) => {
          const { data: screenshotsData, error: ssError } = await supabase
            .from("competitor_screenshots")
            .select("id, image_path, ai_title")
            .eq("competitor_id", c.id)
            .order("created_at", { ascending: true });

          const screenshots = (screenshotsData || []).map((ss) => {
            const { data: { publicUrl } } = supabase.storage
              .from("competitor_images")
              .getPublicUrl(ss.image_path);
            return { ...ss, imageUrl: publicUrl };
          });

          return { ...c, screenshots };
        })
      );
      setCompetitors(competitorsWithDetails);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const handleAddCompetitor = async () => {
    if (!newCompetitorName.trim()) {
      showError("Please provide a name.");
      return;
    }
    const toastId = showLoading("Adding competitor...");
    try {
      const { error } = await supabase
        .from("competitors")
        .insert({ name: newCompetitorName });
      if (error) throw error;
      showSuccess("Competitor added.");
      setNewCompetitorName("");
      fetchCompetitors();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add competitor.");
    } finally {
      dismissToast(toastId);
    }
  };

  const handleDeleteCompetitor = async (competitorId: string) => {
    if (!window.confirm("Are you sure you want to delete this competitor and all its data?")) return;
    const toastId = showLoading("Deleting competitor...");
    try {
      // Storage deletion needs to happen first
      const { data: screenshots } = await supabase.from('competitor_screenshots').select('image_path').eq('competitor_id', competitorId);
      if (screenshots && screenshots.length > 0) {
        const paths = screenshots.map(s => s.image_path);
        await supabase.storage.from('competitor_images').remove(paths);
      }
      
      const { error } = await supabase.from("competitors").delete().eq("id", competitorId);
      if (error) throw error;
      
      showSuccess("Competitor deleted.");
      fetchCompetitors();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      dismissToast(toastId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-background text-foreground p-4 py-8">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2" asChild>
              <Link to="/settings">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex-grow">
              <CardTitle>Manage Competitors</CardTitle>
              <CardDescription>
                Add competitors and their details for analysis.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg">
            <h3 className="text-lg font-medium mb-4">Add New Competitor</h3>
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-grow">
                <Label htmlFor="competitor-name">Competitor Name</Label>
                <Input
                  id="competitor-name"
                  value={newCompetitorName}
                  onChange={(e) => setNewCompetitorName(e.target.value)}
                  placeholder="e.g., Revolut"
                />
              </div>
              <Button onClick={handleAddCompetitor}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Current Competitors</h3>
            {isLoading ? (
              [...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : competitors.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {competitors.map((c) => (
                  <CompetitorAccordionItem
                    key={c.id}
                    competitor={c}
                    onDelete={handleDeleteCompetitor}
                    onUpdate={fetchCompetitors}
                  />
                ))}
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No competitors added yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface CompetitorAccordionItemProps {
  competitor: Competitor;
  onDelete: (id: string) => void;
  onUpdate: () => void;
}

const CompetitorAccordionItem = ({ competitor, onDelete, onUpdate }: CompetitorAccordionItemProps) => {
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const handleUploadScreenshots = async () => {
    if (!newFiles || newFiles.length === 0) {
      showError("Please select files to upload.");
      return;
    }
    setIsUploading(true);
    const toastId = showLoading(`Uploading ${newFiles.length} screenshot(s)...`);
    try {
      const uploadPromises = Array.from(newFiles).map(file => {
        const filePath = `public/${competitor.id}/${Date.now()}-${file.name}`;
        return supabase.storage.from("competitor_images").upload(filePath, file);
      });
      
      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(r => r.data).map(r => ({
        competitor_id: competitor.id,
        image_path: r.data!.path,
      }));

      if (successfulUploads.length > 0) {
        const { error: insertError } = await supabase.from("competitor_screenshots").insert(successfulUploads);
        if (insertError) throw insertError;
      }
      
      const failedCount = results.length - successfulUploads.length;
      if (failedCount > 0) {
        showError(`${failedCount} uploads failed.`);
      } else {
        showSuccess("Screenshots uploaded.");
      }
      setNewFiles(null);
      const fileInput = document.getElementById(`file-input-${competitor.id}`) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      onUpdate();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      dismissToast(toastId);
      setIsUploading(false);
    }
  };

  const handleGenerateDetails = async () => {
    const screenshotsToProcess = competitor.screenshots.filter(s => !s.ai_title);
    if (screenshotsToProcess.length === 0) {
      showError("No new screenshots to analyze.");
      return;
    }
    setIsGenerating(true);
    const toastId = showLoading("Generating AI details...");
    try {
      const screenshot_ids = screenshotsToProcess.map(s => s.id);
      const { error } = await supabase.functions.invoke("generate-competitor-details", {
        body: { competitor_id: competitor.id, screenshot_ids },
      });
      if (error) throw error;
      showSuccess("AI details generated successfully.");
      onUpdate();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to generate details.");
    } finally {
      dismissToast(toastId);
      setIsGenerating(false);
    }
  };

  const handleAddVideo = async () => {
    if (!newVideoUrl.trim()) return;
    const currentVideos = competitor.youtube_videos || [];
    const updatedVideos = [...currentVideos, newVideoUrl];
    const { error } = await supabase.from('competitors').update({ youtube_videos: updatedVideos }).eq('id', competitor.id);
    if (error) {
      showError(error.message);
    } else {
      showSuccess("Video added.");
      setNewVideoUrl("");
      onUpdate();
    }
  };

  const handleDeleteVideo = async (videoUrl: string) => {
    const updatedVideos = (competitor.youtube_videos || []).filter(v => v !== videoUrl);
    const { error } = await supabase.from('competitors').update({ youtube_videos: updatedVideos }).eq('id', competitor.id);
    if (error) showError(error.message);
    else {
      showSuccess("Video removed.");
      onUpdate();
    }
  };

  const handleDeleteScreenshot = async (screenshot: Screenshot) => {
    if (!window.confirm("Delete this screenshot?")) return;
    const toastId = showLoading("Deleting screenshot...");
    try {
      await supabase.storage.from('competitor_images').remove([screenshot.image_path]);
      await supabase.from('competitor_screenshots').delete().eq('id', screenshot.id);
      showSuccess("Screenshot deleted.");
      onUpdate();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      dismissToast(toastId);
    }
  };

  const hasNewScreenshots = competitor.screenshots.some(s => !s.ai_title);

  return (
    <AccordionItem value={competitor.id}>
      <div className="flex items-center w-full">
        <AccordionTrigger className="flex-grow">{competitor.name}</AccordionTrigger>
        <Button variant="ghost" size="icon" onClick={() => onDelete(competitor.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <AccordionContent className="space-y-6 pt-4">
        {/* Descriptions */}
        <div className="space-y-4">
          <div>
            <Label>Short Description</Label>
            <p className="text-sm text-muted-foreground h-6">
              {competitor.short_description || "Not generated yet."}
            </p>
          </div>
          <div>
            <Label>Long Description</Label>
            <Textarea
              readOnly
              value={competitor.long_description || "Not generated yet."}
              className="text-sm text-muted-foreground"
              rows={4}
            />
          </div>
        </div>

        {/* Videos */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">YouTube Videos</h4>
          <div className="space-y-2">
            {(competitor.youtube_videos || []).map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline flex-grow">{url}</a>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteVideo(url)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add YouTube URL" value={newVideoUrl} onChange={e => setNewVideoUrl(e.target.value)} />
            <Button onClick={handleAddVideo} variant="outline">Add</Button>
          </div>
        </div>

        {/* Screenshots */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Screenshots</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {competitor.screenshots.map(ss => (
              <div key={ss.id} className="relative group">
                <img src={ss.imageUrl} alt={ss.ai_title || "Competitor screenshot"} className="rounded-md aspect-[9/16] object-cover w-full" />
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs text-center p-2">{ss.ai_title || "Title not generated"}</p>
                </div>
                <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleDeleteScreenshot(ss)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`file-input-${competitor.id}`}>Add Screenshots</Label>
            <Input id={`file-input-${competitor.id}`} type="file" multiple onChange={e => setNewFiles(e.target.files)} />
          </div>
          <div className="flex gap-4">
            <Button onClick={handleUploadScreenshots} disabled={isUploading || !newFiles}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
            <Button onClick={handleGenerateDetails} disabled={isGenerating || !hasNewScreenshots}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate AI Details
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export default ManageCompetitors;