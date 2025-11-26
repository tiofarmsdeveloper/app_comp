"use client";

import { useState, DragEvent, ChangeEvent, useRef, useEffect } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileWithPreview extends File {
  preview: string;
}

interface MultiFileUploadProps {
  onFilesChange: (files: File[]) => void;
  className?: string;
  id?: string;
}

export const MultiFileUpload = ({ onFilesChange, className, id }: MultiFileUploadProps) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelect = (selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter(file => file.type.startsWith("image/"));
    const newFilesWithPreview = imageFiles.map(file =>
      Object.assign(file, {
        preview: URL.createObjectURL(file),
      })
    );
    const updatedFiles = [...files, ...newFilesWithPreview];
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
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
    if (e.dataTransfer.files) {
      handleFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFilesSelect(Array.from(e.target.files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const newFiles = files.filter((_, index) => {
      if (index === indexToRemove) {
        URL.revokeObjectURL(files[index].preview);
        return false;
      }
      return true;
    });
    setFiles(newFiles);
    onFilesChange(newFiles);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    return () => {
      files.forEach(file => URL.revokeObjectURL(file.preview));
    };
  }, [files]);

  return (
    <div className={cn("w-full", className)}>
      <div
        id={id}
        className={cn(
          "flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
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
        <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
        <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold">Upload competitor screenshots</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drag & drop or click to select files
        </p>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png, image/jpeg, image/gif"
          multiple
        />
      </div>
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-left text-muted-foreground">
            Competitors to compare:
          </h3>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="relative flex items-center justify-between p-2 border rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <img
                  src={file.preview}
                  alt="Preview"
                  className="h-12 w-12 object-contain rounded-md bg-white flex-shrink-0"
                />
                <div className="text-left">
                  <p className="font-medium text-sm truncate max-w-[200px] sm:max-w-xs">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleRemoveFile(index)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};