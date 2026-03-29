'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { UploadCard } from '@/components/upload-card';
import { OCRResultCard } from '@/components/ocr-result-card';
import { GlassCard } from '@/components/glass-card';
import { LoadingSpinner } from '@/components/loading-spinner';
import {
  extractTextFromImage,
  cacheOcrResult,
  formatConfidence,
  type OCRExtractResult,
} from '@/lib/api';
import { AlertCircle, Copy, Check, Languages, ImageIcon } from 'lucide-react';

export default function UploadPage() {
  const auth = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRExtractResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyFromNext = () => {
    if (ocrResult?.text) {
      navigator.clipboard.writeText(ocrResult.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const EXTRACTED_IMAGES_KEY = 'extractedImages';
  const MAX_EXTRACTED_IMAGES = 50;
  const MAX_DATAURL_SIZE = 2 * 1024 * 1024; // 2MB

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setOcrResult(null);
    setIsLoading(true);
    const getIdTokenFn = auth?.getIdToken;
    const getToken = getIdTokenFn ? () => getIdTokenFn() : undefined;

    try {
      const result = await extractTextFromImage(file, { getToken });
      setOcrResult(result);
      if (result.success && result.jobId) {
        cacheOcrResult(result.jobId, result);
        // Store in vault "Extracted images" section (localStorage)
        if (file.size <= MAX_DATAURL_SIZE && typeof globalThis.window !== 'undefined') {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            try {
              const raw = localStorage.getItem(EXTRACTED_IMAGES_KEY);
              const list: { id: string; jobId: string; filename: string; date: string; dataUrl: string }[] = raw ? JSON.parse(raw) : [];
              list.unshift({
                id: crypto.randomUUID(),
                jobId: result.jobId!,
                filename: file.name || result.filename || 'extracted',
                date: new Date().toISOString().slice(0, 10),
                dataUrl,
              });
              localStorage.setItem(EXTRACTED_IMAGES_KEY, JSON.stringify(list.slice(0, MAX_EXTRACTED_IMAGES)));
            } catch (error) {
              console.error('Failed to persist extracted image:', error);
            }
            globalThis.dispatchEvent(new CustomEvent('vault-stats-update'));
          };
          reader.readAsDataURL(file);
        } else {
          globalThis.dispatchEvent(new CustomEvent('vault-stats-update'));
        }
      }
    } catch (error) {
      console.error('OCR extraction failed:', error);
      setOcrResult({
        text: '',
        confidence: 0,
        success: false,
        error: 'An error occurred during extraction',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setOcrResult(null);
  };

  const isReadyForNextStep = Boolean(ocrResult?.text && !ocrResult?.error);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-orbitron font-bold">
            Upload & <span className="neon-text">Extract</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload an image and extract text using written API
          </p>
        </div>

        {/* Upload Section */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload Card */}
          <div>
            <UploadCard
              onFileSelect={handleFileSelect}
              isLoading={isLoading}
              selectedFile={selectedFile}
              onClear={handleClear}
            />
          </div>

          {/* OCR Result or Loading */}
          <div>
            {isLoading && (
              <GlassCard className="h-full flex flex-col items-center justify-center min-h-80">
                <div className="space-y-4 text-center">
                  <LoadingSpinner />
                  <p className="text-foreground font-medium">
                    Extracting text...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Results will appear as soon as the API responds
                  </p>
                </div>
              </GlassCard>
            )}

            {!isLoading && ocrResult && !ocrResult.success && ocrResult.error && (
              <GlassCard className="border-destructive/50 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <h3 className="font-bold text-destructive">Error</h3>
                    <p className="text-sm text-muted-foreground">{ocrResult.error}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Check your connection and try again.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  className="text-sm text-primary hover:underline"
                >
                  Try another image
                </button>
              </GlassCard>
            )}

            {!isLoading && ocrResult && ocrResult.success && (
              <div className="space-y-4">
                <OCRResultCard {...ocrResult} />
              </div>
            )}
          </div>
        </div>

        {/* Next: Copy, Confidence, Translate */}
        {isReadyForNextStep && ocrResult && (
          <GlassCard className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleCopyFromNext}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-primary" />}
                Copy
              </button>
              <span className="text-sm text-muted-foreground">
                Confidence <span className="font-bold text-primary">{formatConfidence(ocrResult.confidence)}%</span>
              </span>
              <Link
                href="/dashboard/translate"
                onClick={() => {
                  if (ocrResult?.text && typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('ocrTextForTranslate', ocrResult.text);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary font-medium hover:bg-primary/30 transition-colors text-sm"
              >
                <Languages className="w-4 h-4" />
                Translate to multiple languages
              </Link>
              <Link
                href="/dashboard/images"
                onClick={() => {
                  if (ocrResult?.text && typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('ocrTextForFindImages', ocrResult.text);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary font-medium hover:bg-primary/30 transition-colors text-sm"
              >
                <ImageIcon className="w-4 h-4" />
                Find image for this text
              </Link>
              <button
                onClick={handleClear}
                className="ml-auto px-4 py-2 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-sm"
              >
                Upload Another
              </button>
            </div>
          </GlassCard>
        )}

        {/* Info Box */}
        {!selectedFile && (
          <GlassCard className="border-primary/30 space-y-3">
            <h3 className="font-bold">Tips for Best Results</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Use clear, high-contrast images for better accuracy</span>
              </li>
              
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Supported formats: JPG, PNG, JPEG</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Maximum file size: 10MB</span>
              </li>
            </ul>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
