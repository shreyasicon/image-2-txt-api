'use client';

import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { GlassCard } from '@/components/glass-card';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadCardProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
  selectedFile?: File | null;
  onClear?: () => void;
}

function SelectedFilePreview({ selectedFile, onClear }: { selectedFile: File; onClear?: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(selectedFile);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Selected Image</h3>
        <button
          onClick={onClear}
          className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="relative w-full h-64 rounded-lg overflow-hidden border border-border/50">
        {objectUrl && (
          <Image
            src={objectUrl}
            alt="Selected file preview"
            fill
            className="object-cover"
            unoptimized
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
    </GlassCard>
  );
}

export function UploadCard({ onFileSelect, isLoading = false, selectedFile, onClear }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  if (selectedFile) {
    return (
      <SelectedFilePreview
        selectedFile={selectedFile}
        onClear={onClear}
      />
    );
  }

  return (
    <GlassCard
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed transition-all cursor-pointer',
        isDragOver
          ? 'border-primary/80 bg-primary/10'
          : 'border-border/50 hover:border-primary/50'
      )}
    >
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <Upload className={cn(
            'w-8 h-8 transition-all',
            isDragOver ? 'text-primary scale-110' : 'text-primary/70'
          )} />
        </div>
        <div className="text-center space-y-1">
          <h3 className="font-bold text-lg">
            {isLoading ? 'Extracting text...' : 'Drop your image here'}
          </h3>
          <p className="text-sm text-muted-foreground">
            or click to browse from your computer
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isLoading}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
          className="px-6 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 font-medium"
        >
          {isLoading ? 'Extracting...' : 'Select Image'}
        </button>
      </div>
    </GlassCard>
  );
}
