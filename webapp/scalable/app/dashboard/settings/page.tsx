'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { GitBranch, ExternalLink, User } from 'lucide-react';

export default function SettingsPage() {
  const auth = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    if (auth?.user?.name) setDisplayName(auth.user.name);
    else if (auth?.user?.username) setDisplayName(auth.user.username);
  }, [auth?.user?.name, auth?.user?.username]);

  const handleSaveName = async () => {
    if (!auth?.updateUsername || !displayName.trim()) return;
    setNameSaving(true);
    setNameSaved(false);
    try {
      await auth.updateUsername(displayName.trim());
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (error) {
      console.error('Failed to update display name:', error);
      setNameSaved(false);
    } finally {
      setNameSaving(false);
    }
  };

  // Don't render protected content until auth has loaded (prevents flash on refresh)
  if (auth?.loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (auth && !auth.user) {
    router.replace('/dashboard');
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  let saveProfileLabel = 'Save';
  if (nameSaving) saveProfileLabel = 'Saving…';
  else if (nameSaved) saveProfileLabel = 'Saved';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-orbitron font-bold">
            <span className="neon-text">Settings</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage your preferences and configurations
          </p>
        </div>

        {/* Profile / Username (when logged in) */}
        {auth?.user && (
          <GlassCard className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Profile
            </h2>
            <div className="space-y-4 border-t border-border/50 pt-4">
              <div className="space-y-2">
                <label
                  htmlFor="display-name"
                  className="block text-sm font-medium"
                >
                  Display name
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  This name is shown in your account. You can change it anytime.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                      id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="flex-1 min-w-[200px] rounded-lg border border-border bg-input px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button onClick={handleSaveName} disabled={nameSaving || !displayName.trim()}>
                    {saveProfileLabel}
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>
        )}

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
                {['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'AWS Cognito', 'OCR API'].map((tech) => (
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
              href="https://github.com/shreyasicon/image-2-txt-api"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="w-5 h-5 text-primary" />
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
