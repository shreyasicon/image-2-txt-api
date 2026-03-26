'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { useAuth } from '@/components/auth-provider';
import { listMyOcrJobs, listMyS3Links } from '@/lib/api';
import { Image as ImageIcon, Zap, Clock, Languages, FileImage } from 'lucide-react';

const TRANSLATION_HISTORY_KEY = 'translationHistory';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: 'image' | 'caption' | 'tag';
}

export default function DashboardPage() {
  const auth = useAuth();
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [translationsCount, setTranslationsCount] = useState(0);
  const [imagesExtractedCount, setImagesExtractedCount] = useState(0);
  const [localExtractedCount, setLocalExtractedCount] = useState(0);

  const fetchImagesExtractedCount = useCallback(async () => {
    if (!auth?.user || !auth.getIdToken) return;
    try {
      const [jobsRes, s3Res] = await Promise.all([
        listMyOcrJobs(() => auth!.getIdToken()),
        listMyS3Links(() => auth!.getIdToken()),
      ]);
      const jobs = jobsRes?.jobs?.length ?? 0;
      const s3 = s3Res?.items?.length ?? 0;
      setImagesExtractedCount(Math.max(jobs, s3));
    } catch (_) {
      setImagesExtractedCount(0);
    }
  }, [auth?.user, auth?.getIdToken]);

  useEffect(() => {
    const stored = localStorage.getItem('vaultItems');
    if (stored) {
      try {
        const items = JSON.parse(stored);
        setRecentItems(items.slice(0, 5));
      } catch (error) {
        console.error('Error loading items:', error);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRANSLATION_HISTORY_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        setTranslationsCount(Array.isArray(arr) ? arr.length : 0);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchImagesExtractedCount();
  }, [fetchImagesExtractedCount]);

  useEffect(() => {
    const onUpdate = () => {
      fetchImagesExtractedCount();
      try {
        const raw = localStorage.getItem('extractedImages');
        const list = raw ? JSON.parse(raw) : [];
        setLocalExtractedCount(Array.isArray(list) ? list.length : 0);
      } catch (_) {
        setLocalExtractedCount(0);
      }
    };
    onUpdate();
    window.addEventListener('vault-stats-update', onUpdate);
    return () => window.removeEventListener('vault-stats-update', onUpdate);
  }, [fetchImagesExtractedCount]);

  const vaultCount = recentItems.length;
  const displayedImagesExtracted = Math.max(imagesExtractedCount, localExtractedCount);
  const stats = [
    { label: 'Total Items', value: vaultCount, icon: ImageIcon, color: 'text-primary' },
    { label: 'Texts translated', value: translationsCount, icon: Languages, color: 'text-secondary' },
    { label: 'Images extracted', value: displayedImagesExtracted, icon: FileImage, color: 'text-primary' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-orbitron font-bold">
              Welcome to Your <span className="neon-text">Vault</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Create, store and elevate your content with API powered extraction, translation and image finding.
      
            </p>
            <p className="text-muted-foreground text-lg">Login to enjoy all features.</p>
          </div>
        </div>

        {/* Stats – only when logged in and auth ready (no flash on refresh) */}
        {auth && !auth.loading && auth.user && (
          <div className="grid md:grid-cols-3 gap-6">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <GlassCard key={stat.label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-3xl font-bold">{stat.value}</p>
                    </div>
                    <Icon className={`w-8 h-8 ${stat.color} opacity-50`} aria-hidden />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Quick Actions</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/dashboard/upload">
              <GlassCard interactive className="cursor-pointer">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-primary" aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Upload Image</h3>
                    <p className="text-sm text-muted-foreground">
                      Extract text and generate content
                    </p>
                  </div>
                </div>
              </GlassCard>
            </Link>

            {auth && !auth.loading && auth.user && (
              <Link href="/dashboard/vault">
                <GlassCard interactive className="cursor-pointer">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-secondary" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">View Vault</h3>
                      <p className="text-sm text-muted-foreground">
                        Browse and manage your content
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        {recentItems.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Recent Activity</h2>
            <GlassCard>
              <div className="space-y-3">
                {recentItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-primary" aria-hidden />
                      </div>
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                    </div>
                    <span className="text-xs px-3 py-1 bg-primary/20 text-primary rounded-full">
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Empty State */}
        {recentItems.length === 0 && (
          <GlassCard className="text-center space-y-4 border-primary/30 py-12">
            <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
              <ImageIcon className="w-8 h-8 text-primary" aria-hidden />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">No content yet</h3>
              <p className="text-muted-foreground mb-6">
                Start by uploading an image to begin creating amazing content
              </p>
              <Link href="/dashboard/upload">
                <GlowButton variant="primary">Upload Your First Image</GlowButton>
              </Link>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
