"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showError, showSuccess } from "@/utils/toast";

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleFileChange = (file: File | null) => {
    setUploadedFile(file);
  };

  const handleAnalyze = () => {
    if (uploadedFile) {
      showSuccess(`Analyzing ${uploadedFile.name}...`);
      // Placeholder for analysis logic
      console.log("Analyzing file:", uploadedFile.name);
    } else {
      showError("Please upload a screenshot first.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">
          Sinder Competitor Analysis Tool
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Upload a screenshot of a mobile app to get started.
        </p>

        <div className="flex flex-col items-center gap-6">
          <FileUpload onFileChange={handleFileChange} />
          <Button
            size="lg"
            onClick={handleAnalyze}
            disabled={!uploadedFile}
            className="w-full max-w-lg"
          >
            Analyze Against Competitors
          </Button>
        </div>
      </div>
      <div className="absolute bottom-0">
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default Index;