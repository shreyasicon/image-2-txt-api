'use client';

import Link from 'next/link';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { ArrowLeft, Github, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  const handleClearCache = () => {
    if (window.confirm('Clear all saved data? This cannot be undone.')) {
      localStorage.clear();
      alert('Cache cleared successfully');
      window.location.reload();
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </div>
          <h1 className="text-4xl font-orbitron font-bold">
            <span className="neon-text">Settings</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage your preferences and configurations
          </p>
        </div>

        {/* API Configuration */}
        <GlassCard className="space-y-4">
          <h2 className="text-xl font-bold">API Configuration</h2>
          <div className="space-y-4 border-t border-border/50 pt-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">OpenAI API Key</label>
              <p className="text-xs text-muted-foreground mb-2">
                Set your OpenAI API key via environment variables for caption and tag generation.
              </p>
              <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                <code className="text-xs text-muted-foreground">NEXT_PUBLIC_OPENAI_API_KEY</code>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">OCR API</label>
              <p className="text-xs text-muted-foreground">
                Text extraction powered by our OCR API. No configuration needed.
              </p>
            </div>

            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <p className="text-sm text-primary">
                ℹ️ For local development, ensure your environment variables are properly set in .env.local
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Preferences */}
        <GlassCard className="space-y-4">
          <h2 className="text-xl font-bold">Preferences</h2>
          <div className="space-y-4 border-t border-border/50 pt-4">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">Dark Theme</p>
                <p className="text-sm text-muted-foreground">Always on</p>
              </div>
              <div className="w-12 h-6 bg-primary/20 rounded-full flex items-center pl-0.5">
                <div className="w-5 h-5 bg-primary rounded-full"></div>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-border/50">
              <div>
                <p className="font-medium">Animations</p>
                <p className="text-sm text-muted-foreground">Smooth UI transitions</p>
              </div>
              <div className="w-12 h-6 bg-primary/20 rounded-full flex items-center pl-0.5">
                <div className="w-5 h-5 bg-primary rounded-full"></div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Data Management */}
        <GlassCard className="space-y-4">
          <h2 className="text-xl font-bold">Data Management</h2>
          <div className="space-y-4 border-t border-border/50 pt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Local Storage</p>
              <p className="text-xs text-muted-foreground mb-3">
                Your vault items are stored locally in your browser. No data is sent to external servers.
              </p>
              <button
                onClick={handleClearCache}
                className="px-4 py-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors font-medium text-sm"
              >
                Clear All Data
              </button>
            </div>
          </div>
        </GlassCard>

        {/* About */}
        <GlassCard className="space-y-4">
          <h2 className="text-xl font-bold">About Iconic Vault</h2>
          <div className="space-y-3 border-t border-border/50 pt-4 text-sm">
            <div>
              <p className="font-medium mb-1">Version</p>
              <p className="text-muted-foreground">1.0.0</p>
            </div>
            <div>
              <p className="font-medium mb-1">Tagline</p>
              <p className="text-muted-foreground">Create. Store. Elevate.</p>
            </div>
            <div>
              <p className="font-medium mb-2">Technologies</p>
              <div className="flex flex-wrap gap-2">
                {['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'OpenAI', 'OCR API'].map((tech) => (
                  <span key={tech} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Support */}
        <GlassCard className="space-y-4 border-primary/30">
          <h2 className="text-xl font-bold">Support & Resources</h2>
          <div className="space-y-2 border-t border-border/50 pt-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Github className="w-5 h-5 text-primary" />
                <span className="font-medium group-hover:text-foreground transition-colors">GitHub Repository</span>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
