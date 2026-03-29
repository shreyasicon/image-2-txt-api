'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/glass-card';
import { Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface VaultCardProps {
  id: string;
  type: 'image' | 'caption' | 'text';
  title: string;
  content: string;
  date: string;
  tags?: string[];
  onDelete?: (id: string) => void;
}

export function VaultCard({
  id,
  type,
  title,
  content,
  date,
  tags = [],
  onDelete,
}: Readonly<VaultCardProps>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const typeColors: Record<string, string> = {
    image: 'bg-primary/20 text-primary',
    caption: 'bg-secondary/20 text-secondary',
    text: 'bg-cyan-500/20 text-cyan-400',
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isImageDataUrl = type === 'image' && typeof content === 'string' && content.startsWith('data:');
  const contentPreview = content.length > 100 ? content.substring(0, 100) + '...' : content;

  return (
    <GlassCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-1 rounded ${typeColors[type]} font-medium`}>
              {type.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <h3 className="font-bold text-foreground truncate">{title}</h3>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={copyToClipboard}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            title="Copy content"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground hover:text-primary" />
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            title="Toggle details"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(id)}
              className="p-2 hover:bg-destructive/20 hover:text-destructive rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {!expanded && (
        isImageDataUrl ? (
          <div className="rounded-lg overflow-hidden bg-muted max-h-32">
            <img src={content} alt={title} className="w-full h-full object-contain" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground line-clamp-2">{contentPreview}</p>
        )
      )}

      {/* Expanded View */}
      {expanded && (
        <div className="space-y-3 border-t border-border/50 pt-3">
          {isImageDataUrl ? (
            <div className="rounded-lg overflow-hidden bg-muted max-h-64">
              <img src={content} alt={title} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-background/50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
            </div>
          )}

          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Tags:</p>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={`${id}-tag-${tag}`}
                    className="text-xs px-2 py-1 bg-primary/10 text-primary rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
