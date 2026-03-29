'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { translateText, translateHealth } from '@/lib/api';
import { Languages, AlertCircle, Copy, Check, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

const TRANSLATION_HISTORY_KEY = 'translationHistory';
const MAX_HISTORY = 50;

export interface SavedTranslation {
  original_text: string;
  source_lang: string;
  translations: Record<string, string>;
  timestamp: number;
}

const LANG_OPTIONS = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
] as const;

/** Keeps payloads within a safe size for API Gateway / JSON bodies. */
const MAX_TRANSLATE_INPUT_CHARS = 8000;

export default function TranslatePage() {
  const auth = useAuth();
  const [inputText, setInputText] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set(LANG_OPTIONS.map((l) => l.code)));
  const [result, setResult] = useState<{ original_text: string; source_lang: string; translations: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [history, setHistory] = useState<SavedTranslation[]>([]);

  useEffect(() => {
    const t = setTimeout(() => translateHealth().then((ok) => setApiDown(!ok)), 100);
    if (typeof sessionStorage !== 'undefined') {
      const fromOcr = sessionStorage.getItem('ocrTextForTranslate');
      if (fromOcr) {
        setInputText(fromOcr);
        sessionStorage.removeItem('ocrTextForTranslate');
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(TRANSLATION_HISTORY_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setHistory(Array.isArray(arr) ? arr : []);
      } catch (_) {}
    }
    return () => clearTimeout(t);
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

  const trimmed = inputText.trim();
  const hasTargets = selectedLangs.size > 0;
  const canSubmit = trimmed.length > 0 && hasTargets && !loading;

  const handleTranslate = async () => {
    const text = inputText.trim();
    if (!text || selectedLangs.size === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const targetList = selectedLangs.size > 0 ? Array.from(selectedLangs) : LANG_OPTIONS.map((l) => l.code);
      const data = await translateText(text, { target_languages: targetList });
      setResult(data || null);
      if (data && typeof localStorage !== 'undefined') {
        const entry: SavedTranslation = {
          original_text: data.original_text,
          source_lang: data.source_lang,
          translations: data.translations || {},
          timestamp: Date.now(),
        };
        try {
          const raw = localStorage.getItem(TRANSLATION_HISTORY_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          const next = [entry, ...(Array.isArray(arr) ? arr : [])].slice(0, MAX_HISTORY);
          localStorage.setItem(TRANSLATION_HISTORY_KEY, JSON.stringify(next));
          setHistory(next);
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  const [copiedLang, setCopiedLang] = useState<string | null>(null);
  const copyTranslation = (text: string, langCode: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLang(langCode);
    setTimeout(() => setCopiedLang(null), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
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
        <div>
          <h2 className="text-lg font-semibold">Try it yourself (with validation)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Text is checked before sending: non-empty after trim, at least one target language, and a maximum
            length ({MAX_TRANSLATE_INPUT_CHARS.toLocaleString()} characters) to keep requests within API limits.
          </p>
        </div>
        <div>
          <label
            htmlFor="translate-text"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Enter text to translate
          </label>
          <textarea
            id="translate-text"
            aria-describedby="translate-text-validation"
            maxLength={MAX_TRANSLATE_INPUT_CHARS}
            className="w-full min-h-[120px] rounded-lg border border-border bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Hello world"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div
            id="translate-text-validation"
            className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-muted-foreground"
          >
            <span>Whitespace is trimmed before send. Maximum length enforced below.</span>
            <span
              className={
                inputText.length >= MAX_TRANSLATE_INPUT_CHARS * 0.9 ? 'text-amber-500 font-medium' : ''
              }
            >
              {inputText.length.toLocaleString()} / {MAX_TRANSLATE_INPUT_CHARS.toLocaleString()}
            </span>
          </div>
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
          {!hasTargets && (
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-2" role="status">
              Select at least one target language to translate.
            </p>
          )}
        </div>
        <GlowButton onClick={handleTranslate} disabled={!canSubmit}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Translate'}
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
              const isCopied = copiedLang === langCode;
              return (
                <div key={langCode} className="flex items-center gap-2 flex-wrap group">
                  <span className="font-medium text-primary shrink-0">{name}</span>
                  <span className="text-foreground flex-1 min-w-0">{translation}</span>
                  <button
                    type="button"
                    onClick={() => copyTranslation(translation, langCode)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
                    title="Copy to clipboard"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-primary" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Previous translations – only for logged-in users */}
      {auth?.user && history.length > 0 && (
        <GlassCard className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Previously converted texts
          </h2>
          <ul className="space-y-4 border-t border-border/50 pt-4 max-h-[400px] overflow-y-auto">
            {history.map((item, idx) => (
              <li key={item.timestamp + idx} className="pb-4 border-b border-border/50 last:border-0 last:pb-0">
                <p className="text-xs text-muted-foreground mb-1">
                  {new Date(item.timestamp).toLocaleString()} · source: {item.source_lang}
                </p>
                <p className="text-sm font-medium text-foreground mb-2 line-clamp-2">{item.original_text}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(item.translations || {}).slice(0, 5).map(([code, trans]) => {
                    const name = LANG_OPTIONS.find((l) => l.code === code)?.name || code;
                    return (
                      <span key={code} className="text-xs px-2 py-1 rounded bg-muted/80 text-muted-foreground">
                        {name}: {trans.slice(0, 40)}{trans.length > 40 ? '…' : ''}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
