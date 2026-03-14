'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { LoadingSpinner } from '@/components/loading-spinner';
import { translateText, translateHealth } from '@/lib/api';
import { ArrowLeft, Languages, AlertCircle } from 'lucide-react';

const LANG_OPTIONS = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
] as const;

export default function TranslatePage() {
  const [inputText, setInputText] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set(LANG_OPTIONS.map((l) => l.code)));
  const [result, setResult] = useState<{ original_text: string; source_lang: string; translations: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    translateHealth().then((ok) => setApiDown(!ok));
  }, []);

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAll = () => setSelectedLangs(new Set(LANG_OPTIONS.map((l) => l.code)));
  const clearAll = () => setSelectedLangs(new Set());

  const handleTranslate = async () => {
    const text = inputText.trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    try {
      const targetList = selectedLangs.size > 0 ? Array.from(selectedLangs) : LANG_OPTIONS.map((l) => l.code);
      const data = await translateText(text, { target_languages: targetList });
      setResult(data || null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-orbitron font-bold flex items-center gap-2">
          <Languages className="w-8 h-8 text-primary" />
          Text to Multiple Languages API
        </h1>
      </div>

      {apiDown && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Translation API is unreachable. Check your connection and that the API allows CORS for this origin.</span>
        </div>
      )}

      <GlassCard className="space-y-4">
        <h2 className="text-lg font-semibold">Try it yourself</h2>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Enter text to translate</label>
          <textarea
            className="w-full min-h-[120px] rounded-lg border border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Hello world"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-medium text-muted-foreground">Target languages:</span>
            <button type="button" onClick={selectAll} className="text-sm text-primary hover:underline">
              Select all
            </button>
            <span className="text-muted-foreground">|</span>
            <button type="button" onClick={clearAll} className="text-sm text-primary hover:underline">
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            {LANG_OPTIONS.map(({ code, name }) => (
              <label key={code} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLangs.has(code)}
                  onChange={() => toggleLang(code)}
                  className="rounded border-border"
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>
        <GlowButton onClick={handleTranslate} disabled={loading || !inputText.trim()}>
          {loading ? <LoadingSpinner className="w-4 h-4" /> : 'Translate'}
        </GlowButton>
      </GlassCard>

      {result && (
        <GlassCard className="space-y-4">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="text-muted-foreground">
            <strong>Original:</strong> {result.original_text}
          </p>
          <p className="text-muted-foreground">
            <strong>Detected source:</strong> {result.source_lang}
          </p>
          <div className="space-y-2 border-t border-border/50 pt-4">
            {Object.entries(result.translations || {}).map(([langCode, translation]) => {
              const name = LANG_OPTIONS.find((l) => l.code === langCode)?.name || langCode;
              return (
                <div key={langCode}>
                  <span className="font-medium text-primary">{name}</span>
                  <span className="text-foreground"> {translation}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
