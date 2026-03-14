'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/glass-card';
import { Copy, Check, Save } from 'lucide-react';

interface CaptionCardProps {
  caption: string;
  index: number;
  onSave?: (caption: string) => void;
}

export function CaptionCard({ caption, index, onSave }: CaptionCardProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(caption);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <GlassCard className="space-y-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-xs font-orbitron text-primary/70 tracking-widest">
            CAPTION {index}
          </span>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={copyToClipboard}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-primary/70" />
            )}
          </button>
          <button
            onClick={handleSave}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            title="Save to vault"
          >
            {saved ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Save className="w-4 h-4 text-primary/70" />
            )}
          </button>
        </div>
      </div>
      <p className="text-foreground leading-relaxed text-sm">
        {caption}
      </p>
      <p className="text-xs text-muted-foreground">
        {caption.split(/\s+/).length} words
      </p>
    </GlassCard>
  );
}
