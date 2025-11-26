"use client";

import { useState, DragEvent, ChangeEvent, useRef, useEffect } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileChange: (file: File | null) => void;
  id?: string;
}

export const FileUpload = ({ onFileChange, id }: FileUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      setIsProcessing(true);
      setTimeout(() => {
        setFile(selectedFile);
        onFileChange(selectedFile);
        const previewUrl = URL.createObjectURL(selectedFile);
        setPreview(previewUrl);
        setIsProcessing(false);
      }, 500);
    } else {
      console.error("Invalid file type. Please upload an image.");
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    onFileChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  return (
    <div className="w-full">
      {isProcessing ? (
        <div className="relative flex items-center justify-between p-3 border rounded-lg bg-muted/50 h-[88px]">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
            </div>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : file && preview ? (
        <div className="relative flex items-center justify-between p-3 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-4">
            <img
              src={preview}
              alt="Preview"
              className="h-16 w-16 object-contain rounded-md bg-white"
            />
            <div className="text-left">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7"
            onClick={handleRemoveFile}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Remove file</span>
          </Button>
        </div>
      ) : (
        <div
          id={id}
          className={cn(
            "flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileInput}
        >
          <UploadCloud className="w-12 h-12 text-gray-400 mb-4" />
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PNG, JPG, or GIF
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/png, image/jpeg, image/gif"
          />
        </div>
      )}
    </div>
  );
};