"use client";

import { createContext, useState, useContext, ReactNode } from 'react';

interface UploadContextType {
  uploadedFile: File | null;
  setUploadedFile: (file: File | null) => void;
  competitorFiles: File[];
  setCompetitorFiles: (files: File[]) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [competitorFiles, setCompetitorFiles] = useState<File[]>([]);

  return (
    <UploadContext.Provider value={{ uploadedFile, setUploadedFile, competitorFiles, setCompetitorFiles }}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};