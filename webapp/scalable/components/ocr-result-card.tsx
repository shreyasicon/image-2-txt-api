'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/glass-card';
import { Copy, Check } from 'lucide-react';
import type { OCRExtractResult, OCRQuality, OCRQualityMetrics, OCRScript } from '@/lib/api';
import { formatConfidence } from '@/lib/api';

interface OCRResultCardProps extends OCRExtractResult {}

export function OCRResultCard(props: OCRResultCardProps) {
  const { text, confidence, uploadValidation, quality, script } = props;
  const [copiedText, setCopiedText] = useState(false);

  const confidencePct = formatConfidence(confidence);
  const displayConfidence = `${confidencePct}%`;

  const copyText = () => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const scriptLabel = script?.primaryScript
    ? (script.likelyEnglish ? 'English' : script.primaryScript)
    : null;

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Extracted Text</h3>
        <button
          onClick={copyText}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors"
          title="Copy extracted text"
        >
          {copiedText ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-primary" />}
          Copy
        </button>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-bold text-primary">{displayConfidence}</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
          style={{ width: `${confidencePct}%` }}
        />
      </div>

      <div className="bg-background/50 rounded-lg p-4 max-h-64 overflow-y-auto">
        <p className="text-foreground/90 whitespace-pre-wrap text-sm leading-relaxed">
          {text || '—'}
        </p>
      </div>

      <div className="border-t border-border/50 pt-4 space-y-2 text-sm">
        {scriptLabel && (
          <p className="text-muted-foreground">
            Script / language hint: {scriptLabel}
          </p>
        )}
        {uploadValidation && (
          <p className="text-muted-foreground">
            Upload: {uploadValidation.valid ? 'Valid' : 'Invalid'}
          </p>
        )}
        {quality && (
          <p className="text-muted-foreground">
            Quality: {quality.status ?? '—'}
            {typeof quality.score === 'number' && `, Score: ${quality.score}`}
          </p>
        )}
        {quality?.metrics && (
          <MetricsOnly metrics={quality.metrics} />
        )}
      </div>
    </GlassCard>
  );
}

function MetricsOnly({ metrics }: { metrics: OCRQualityMetrics }) {
  const alpha =
    metrics.alphaRatio != null
      ? typeof metrics.alphaRatio === 'number' && metrics.alphaRatio <= 1
        ? `${(metrics.alphaRatio * 100).toFixed(1)}%`
        : String(metrics.alphaRatio)
      : null;
  return (
    <div className="text-muted-foreground">
      <span className="font-medium text-foreground">Metrics</span>
      <p className="mt-0.5 space-x-2">
        {metrics.fileType != null && <span>fileType: {String(metrics.fileType)}</span>}
        {metrics.charCount != null && <span>charCount: {metrics.charCount}</span>}
        {metrics.wordCount != null && <span>wordCount: {metrics.wordCount}</span>}
        {alpha != null && <span>alphaRatio: {alpha}</span>}
      </p>
    </div>
  );
}
