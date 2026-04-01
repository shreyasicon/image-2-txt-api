'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { translateText, translateHealth, TRANSLATE_API_PUBLIC_BASE_URL } from '@/lib/api';
import { Languages, AlertCircle, Copy, Check, Clock, Loader2, BookOpen } from 'lucide-react';
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

export default function TranslatePage() {
  const auth = useAuth();
  const [inputText, setInputText] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set(LANG_OPTIONS.map((l) => l.code)));
  const [result, setResult] = useState<{ original_text: string; source_lang: string; translations: Record<string, string> } | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
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
      } catch (error) {
        console.error('Failed to load translation history:', error);
      }
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

  const handleTranslate = async () => {
    setLoading(true);
    setResult(null);
    setTranslateError(null);
    try {
      const targetList =
        selectedLangs.size > 0 ? Array.from(selectedLangs) : LANG_OPTIONS.map((l) => l.code);
      const data = await translateText(inputText, {
        target_languages: targetList,
        ...(auth && {
          getAccessToken: auth.getAccessToken,
          getIdToken: auth.getIdToken,
        }),
      });
      if (!data) {
        setTranslateError(
          auth?.user
            ? 'Translation failed. The translate API must accept JWTs from this app’s Cognito user pool (same login as the vault). If your pool is already wired on the API, try again.'
            : 'Translation failed. Sign in with your vault account so we can send your Cognito token, or enable anonymous POST /translate on the API.'
        );
        return;
      }
      setResult(data);
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
        } catch (error) {
          console.error('Failed to persist translation history:', error);
        }
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

      {!auth?.user && !auth?.loading && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span className="text-foreground font-medium">Tip:</span> You can try Translate without signing in if the API allows it.{' '}
          <Link href="/dashboard/auth" className="text-primary underline underline-offset-2">
            Sign in
          </Link>{' '}
          to use the same Cognito session as the rest of the vault (recommended if the API requires auth).
        </div>
      )}

      {translateError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{translateError}</span>
        </div>
      )}

      <GlassCard className="space-y-4">
        <h2 className="text-lg font-semibold">Try it yourself</h2>
        <div>
          <label
            htmlFor="translate-text"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Enter text to translate
          </label>
          <textarea
            id="translate-text"
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
        <GlowButton onClick={handleTranslate} disabled={loading}>
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

      <GlassCard className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          API Reference
        </h2>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Base URL:</strong>{' '}
          <code className="rounded bg-muted/80 px-1.5 py-0.5 text-xs break-all">{TRANSLATE_API_PUBLIC_BASE_URL}</code>
          . All responses are JSON.
        </p>
        <div className="space-y-2 text-sm border-t border-border/50 pt-4">
          <p className="font-medium text-foreground">POST /translate</p>
          <p className="text-muted-foreground">
            Send JSON body: <code className="text-xs bg-muted/80 px-1 rounded">{'{ "text": "Your text" }'}</code>.
            Optional: <code className="text-xs">source_lang</code>,{' '}
            <code className="text-xs">target_languages</code> (array of language codes).
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Response:</strong>
          </p>
          <pre className="rounded-lg border border-border bg-muted/30 p-4 text-xs overflow-x-auto text-foreground font-mono leading-relaxed">
            {`{
  "original_text": "...",
  "source_lang": "en",
  "translations": {
    "es": "...",
    "fr": "...",
    "de": "...",
    "it": "...",
    "pt": "..."
  }
}`}
          </pre>
        </div>
      </GlassCard>

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
