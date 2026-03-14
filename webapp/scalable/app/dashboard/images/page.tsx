'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { LoadingSpinner } from '@/components/loading-spinner';
import {
  isUnsplashConfigured,
  fetchUnsplashPhotos,
  searchUnsplashPhotos,
  type UnsplashPhoto,
} from '@/lib/api';
import { ArrowLeft, ImageIcon, Search, AlertCircle, ExternalLink } from 'lucide-react';

const PER_PAGE = 12;

export default function FindImagesPage() {
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadPhotos = useCallback(async (pageNum: number, isSearch: boolean, append: boolean) => {
    if (!isUnsplashConfigured) return;
    setLoading(true);
    try {
      const list = isSearch && query.trim()
        ? await searchUnsplashPhotos(query, PER_PAGE, pageNum)
        : await fetchUnsplashPhotos(PER_PAGE, pageNum);
      setPhotos((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length >= PER_PAGE);
    } catch {
      setPhotos((prev) => (append ? prev : []));
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!isUnsplashConfigured) return;
    loadPhotos(1, false, false);
  }, [isUnsplashConfigured]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    setQuery(q);
    setPage(1);
    if (!isUnsplashConfigured) return;
    setLoading(true);
    if (q) {
      searchUnsplashPhotos(q, PER_PAGE, 1).then((list) => {
        setPhotos(list);
        setHasMore(list.length >= PER_PAGE);
        setLoading(false);
      }).catch(() => {
        setPhotos([]);
        setHasMore(false);
        setLoading(false);
      });
    } else {
      fetchUnsplashPhotos(PER_PAGE, 1).then((list) => {
        setPhotos(list);
        setHasMore(list.length >= PER_PAGE);
        setLoading(false);
      }).catch(() => {
        setPhotos([]);
        setHasMore(false);
        setLoading(false);
      });
    }
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    loadPhotos(next, !!query.trim(), true);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-orbitron font-bold flex items-center gap-2">
          <ImageIcon className="w-8 h-8 text-primary" />
          Find Images
        </h1>
      </div>

      {!isUnsplashConfigured && (
        <GlassCard className="border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="font-medium">Unsplash key not set</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Add <code className="bg-muted px-1 rounded">NEXT_PUBLIC_UNSPLASH_ACCESS_KEY</code> to{' '}
            <code className="bg-muted px-1 rounded">.env.local</code> in <code className="bg-muted px-1 rounded">webapp/scalable</code>, then restart the dev server.
          </p>
          <a
            href="https://unsplash.com/developers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Get a key at Unsplash Developers <ExternalLink className="w-4 h-4" />
          </a>
        </GlassCard>
      )}

      {isUnsplashConfigured && (
        <>
          <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search photos (e.g. nature, coffee)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <GlowButton type="submit" variant="outline" disabled={loading}>
              Search
            </GlowButton>
          </form>

          {loading && photos.length === 0 ? (
            <GlassCard className="flex flex-col items-center justify-center min-h-48 gap-4">
              <LoadingSpinner />
              <p className="text-muted-foreground">Loading photos…</p>
            </GlassCard>
          ) : photos.length === 0 ? (
            <GlassCard>
              <p className="text-muted-foreground text-center py-8">
                {query ? `No photos found for “${query}”. Try another search.` : 'No photos loaded.'}
              </p>
            </GlassCard>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.links?.html || 'https://unsplash.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="aspect-square relative bg-muted">
                      <Image
                        src={photo.urls?.regular || photo.urls?.small || photo.urls?.thumb || ''}
                        alt={photo.alt_description || 'Unsplash photo'}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                      />
                    </div>
                    <div className="p-2 bg-background/80">
                      <p className="text-xs text-muted-foreground truncate">
                        by {photo.user?.name || 'Unknown'}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <GlowButton onClick={loadMore} disabled={loading} variant="outline">
                    {loading ? <LoadingSpinner /> : 'Load more'}
                  </GlowButton>
                </div>
              )}
            </>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Photos from{' '}
            <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Unsplash
            </a>
          </p>
        </>
      )}
    </div>
  );
}
