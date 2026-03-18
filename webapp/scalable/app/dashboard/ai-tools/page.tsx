'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { LoadingSpinner } from '@/components/loading-spinner';
import { CaptionCard } from '@/components/caption-card';
import { generateCaptions, generateTags, enhanceContent, hasOpenAIKey } from '@/lib/api';
import { AlertCircle, RefreshCw, KeyRound } from 'lucide-react';

type Tone = 'professional' | 'creative' | 'viral';
type EnhancementAction = 'rewrite-formal' | 'rewrite-viral' | 'summarize' | 'expand' | 'translate';

const toneOptions: { label: string; value: Tone }[] = [
  { label: 'Professional', value: 'professional' },
  { label: 'Creative', value: 'creative' },
  { label: 'Viral', value: 'viral' },
];

const enhancementOptions: { label: string; value: EnhancementAction }[] = [
  { label: 'Formal Tone', value: 'rewrite-formal' },
  { label: 'Viral Version', value: 'rewrite-viral' },
  { label: 'Summarize', value: 'summarize' },
  { label: 'Expand', value: 'expand' },
  { label: 'Translate to Spanish', value: 'translate' },
];

export default function AIToolsPage() {
  const [inputText, setInputText] = useState('');
  const [captions, setCaptions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [enhancedText, setEnhancedText] = useState('');
  const [tone, setTone] = useState<Tone>('creative');
  const [selectedEnhancement, setSelectedEnhancement] = useState<EnhancementAction>('rewrite-formal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'captions' | 'tags' | 'enhance'>('captions');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Try to load text from session storage or localStorage
    const stored = sessionStorage.getItem('extractedText') || localStorage.getItem('lastExtractedText');
    if (stored) {
      setInputText(stored);
    }
  }, []);

  const handleGenerateCaptions = async () => {
    if (!inputText.trim()) {
      setError('Please enter or extract text first');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const result = await generateCaptions(inputText, tone);
      setCaptions(result.length > 0 ? result : []);
      if (result.length === 0) setError('OpenAI returned no captions. Try different text or tone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateTags = async () => {
    if (!inputText.trim()) {
      setError('Please enter or extract text first');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const result = await generateTags(inputText);
      setTags(result?.length ? result : []);
      if (!result?.length) setError('OpenAI returned no tags.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnhanceContent = async () => {
    if (!inputText.trim()) {
      setError('Please enter or extract text first');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const result = await enhanceContent(inputText, selectedEnhancement);
      setEnhancedText(result || '');
      if (!result) setError('OpenAI returned no content.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const saveCaptionToVault = (caption: string) => {
    try {
      const existing = localStorage.getItem('vaultItems');
      const items = existing ? JSON.parse(existing) : [];
      
      const newItem = {
        id: Date.now().toString(),
        type: 'caption' as const,
        title: caption.substring(0, 50) + (caption.length > 50 ? '...' : ''),
        content: caption,
        extractedText: inputText,
        date: new Date().toLocaleString(),
        tags: tags,
      };
      
      items.unshift(newItem);
      localStorage.setItem('vaultItems', JSON.stringify(items.slice(0, 50)));
      return true;
    } catch (err) {
      console.error('Error saving to vault:', err);
      return false;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-orbitron font-bold">
              AI <span className="neon-text">Tools</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Generate captions, tags, and enhance your content
            </p>
          </div>
        </div>

        {/* Where to paste OpenAI API key */}
        <GlassCard className="border-primary/30 space-y-2">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-foreground">OpenAI API key</h3>
              <p className="text-sm text-muted-foreground">
                {hasOpenAIKey()
                  ? 'Your OpenAI key is configured. Captions, tags, and enhancements will use it.'
                  : 'Set your key in .env.local as NEXT_PUBLIC_OPENAI_API_KEY=sk-... (no quotes, no spaces). Restart the dev server after changing.'}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Input Text Area */}
        <GlassCard className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-bold">Your Content</label>
            <Link href="/dashboard/upload" className="text-sm text-primary hover:underline">
              Extract from image
            </Link>
          </div>
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your text here or extract it from an image..."
            className="w-full min-h-32 p-4 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {inputText.length} characters • {inputText.split(/\s+/).filter(w => w).length} words
          </p>
        </GlassCard>

        {/* Error Message */}
        {error && (
          <GlassCard className="border-destructive/50 space-y-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-destructive">Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </GlassCard>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/50 overflow-x-auto">
          {[
            { id: 'captions', label: 'Caption Generator' },
            { id: 'tags', label: 'Tag Generator' },
            { id: 'enhance', label: 'Enhance Content' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Tabs */}
        {activeTab === 'captions' && (
          <div className="space-y-6">
            <GlassCard className="space-y-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium">Tone</label>
                <div className="flex gap-2 flex-wrap">
                  {toneOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setTone(option.value)}
                      className={`px-4 py-2 rounded-lg transition-all ${
                        tone === option.value
                          ? 'bg-primary/20 text-primary border border-primary/50'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-border/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <GlowButton
                variant="primary"
                onClick={handleGenerateCaptions}
                disabled={isLoading || !inputText.trim()}
                className="w-full"
              >
                {isLoading ? 'Generating...' : 'Generate Captions'}
              </GlowButton>
            </GlassCard>

            {isLoading && activeTab === 'captions' && (
              <GlassCard className="flex flex-col items-center justify-center py-12">
                <LoadingSpinner />
                <p className="mt-4 text-foreground font-medium">Generating captions...</p>
              </GlassCard>
            )}

            {captions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Generated Captions</h3>
                  <button
                    onClick={handleGenerateCaptions}
                    disabled={isLoading}
                    className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
                    title="Regenerate"
                  >
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {captions.map((caption, idx) => (
                    <CaptionCard
                      key={idx}
                      caption={caption}
                      index={idx + 1}
                      onSave={() => saveCaptionToVault(caption)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="space-y-6">
            <GlowButton
              variant="primary"
              onClick={handleGenerateTags}
              disabled={isLoading || !inputText.trim()}
              className="w-full"
            >
              {isLoading ? 'Generating...' : 'Generate Tags'}
            </GlowButton>

            {isLoading && activeTab === 'tags' && (
              <GlassCard className="flex flex-col items-center justify-center py-12">
                <LoadingSpinner />
                <p className="mt-4 text-foreground font-medium">Generating tags...</p>
              </GlassCard>
            )}

            {tags.length > 0 && (
              <GlassCard className="space-y-4">
                <h3 className="font-bold text-lg">Generated Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="px-3 py-2 bg-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors cursor-pointer group"
                      onClick={() => navigator.clipboard.writeText(tag)}
                      title="Click to copy"
                    >
                      <span className="group-hover:hidden">{tag}</span>
                      <span className="hidden group-hover:inline">Copy</span>
                    </button>
                  ))}
                </div>
                <div className="pt-4 flex gap-2">
                  <GlowButton
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(tags.join(' '))}
                    className="flex-1"
                  >
                    Copy All Tags
                  </GlowButton>
                  <button
                    onClick={handleGenerateTags}
                    disabled={isLoading}
                    className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </button>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {activeTab === 'enhance' && (
          <div className="space-y-6">
            <GlassCard className="space-y-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium">Enhancement Type</label>
                <div className="grid md:grid-cols-2 gap-2">
                  {enhancementOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedEnhancement(option.value)}
                      className={`px-4 py-2 rounded-lg transition-all text-sm ${
                        selectedEnhancement === option.value
                          ? 'bg-primary/20 text-primary border border-primary/50'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-border/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <GlowButton
                variant="primary"
                onClick={handleEnhanceContent}
                disabled={isLoading || !inputText.trim()}
                className="w-full"
              >
                {isLoading ? 'Enhancing...' : 'Enhance Content'}
              </GlowButton>
            </GlassCard>

            {isLoading && activeTab === 'enhance' && (
              <GlassCard className="flex flex-col items-center justify-center py-12">
                <LoadingSpinner />
                <p className="mt-4 text-foreground font-medium">Enhancing your content...</p>
              </GlassCard>
            )}

            {enhancedText && (
              <GlassCard className="space-y-4">
                <h3 className="font-bold text-lg">Enhanced Content</h3>
                <div className="bg-background/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {enhancedText}
                  </p>
                </div>
                <div className="flex gap-2">
                  <GlowButton
                    variant="primary"
                    onClick={() => navigator.clipboard.writeText(enhancedText)}
                    className="flex-1"
                  >
                    Copy Text
                  </GlowButton>
                  <button
                    onClick={handleEnhanceContent}
                    disabled={isLoading}
                    className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </button>
                </div>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
