'use client';

import { useState, useEffect, useCallback, type FormEventHandler, type ReactNode } from 'react';
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
import { useAuth } from '@/components/auth-provider';
import { ImageIcon, Search, AlertCircle, ExternalLink, Heart } from 'lucide-react';

const PER_PAGE = 12;
const FAVOURITES_KEY = 'unsplashFavourites';

function loadFavourites(): UnsplashPhoto[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFavourites(photos: UnsplashPhoto[]) {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(photos));
  } catch {
    /* ignore quota / private mode */
  }
}

export default function FindImagesPage() {
  const auth = useAuth();
  const isLoggedIn = Boolean(auth && !auth.loading && auth.user);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [favourites, setFavourites] = useState<UnsplashPhoto[]>([]);

  useEffect(() => {
    setFavourites(loadFavourites());
  }, []);

  const isFavourite = (id: string) => favourites.some((p) => p.id === id);
  const toggleFavourite = (photo: UnsplashPhoto) => {
    const next = isFavourite(photo.id)
      ? favourites.filter((p) => p.id !== photo.id)
      : [...favourites, photo];
    setFavourites(next);
    saveFavourites(next);
  };

  const loadPhotos = useCallback(async (pageNum: number, isSearch: boolean, append: boolean) => {
    if (!isUnsplashConfigured) return;
    setLoading(true);
    try {
      const list = isSearch && query.trim()
        ? await searchUnsplashPhotos(query, PER_PAGE, pageNum)
        : await fetchUnsplashPhotos(PER_PAGE, pageNum);
      setPhotos((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length >= PER_PAGE);
    } catch (err) {
      console.error('Unsplash load failed:', err);
      setPhotos((prev) => (append ? prev : []));
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!isUnsplashConfigured) return;
    const fromOcr = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('ocrTextForFindImages');
    if (fromOcr) {
      sessionStorage.removeItem('ocrTextForFindImages');
      const q = fromOcr.trim().slice(0, 100);
      setSearchInput(q);
      setQuery(q);
      setPage(1);
      if (q) {
        setLoading(true);
        searchUnsplashPhotos(q, PER_PAGE, 1).then((list) => {
          setPhotos(list);
          setHasMore(list.length >= PER_PAGE);
          setLoading(false);
        }).catch((err) => {
          console.error('Unsplash search failed:', err);
          setPhotos([]);
          setHasMore(false);
          setLoading(false);
        });
      } else {
        loadPhotos(1, false, false);
      }
      return;
    }
    loadPhotos(1, false, false);
    // Intentionally run only when config is available; loadPhotos is stable for initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnsplashConfigured]);

  const handleSearch: FormEventHandler<HTMLFormElement> = (e) => {
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
      }).catch((err) => {
        console.error('Unsplash search failed:', err);
        setPhotos([]);
        setHasMore(false);
        setLoading(false);
      });
    } else {
      fetchUnsplashPhotos(PER_PAGE, 1).then((list) => {
        setPhotos(list);
        setHasMore(list.length >= PER_PAGE);
        setLoading(false);
      }).catch((err) => {
        console.error('Unsplash fetch failed:', err);
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

  const renderPhotosMain = (): ReactNode => {
    if (loading && photos.length === 0) {
      return (
        <GlassCard className="flex flex-col items-center justify-center min-h-48 gap-4">
          <LoadingSpinner />
          <p className="text-muted-foreground">Loading photos…</p>
        </GlassCard>
      );
    }
    if (photos.length === 0) {
      return (
        <GlassCard>
          <p className="text-muted-foreground text-center py-8">
            {query ? `No photos found for “${query}”. Try another search.` : 'No photos loaded.'}
          </p>
        </GlassCard>
      );
    }
    return (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
            >
              <a
                href={photo.links?.html || 'https://unsplash.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
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
              {isLoggedIn && (
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavourite(photo);
                    }}
                    className="p-2 rounded-full bg-background/80 border border-border hover:bg-primary/20 transition-colors"
                    title={isFavourite(photo.id) ? 'Remove from favourites' : 'Add to favourites'}
                    aria-label={isFavourite(photo.id) ? 'Remove from favourites' : 'Add to favourites'}
                  >
                    <Heart
                      className={`w-5 h-5 ${isFavourite(photo.id) ? 'fill-primary text-primary' : 'text-muted-foreground'}`}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const existing = localStorage.getItem('vaultItems');
                        const items = existing ? JSON.parse(existing) : [];
                        const title =
                          (photo as { description?: string }).description ||
                          photo.alt_description ||
                          `Unsplash image by ${photo.user?.name || 'Unknown'}`;
                        const imageUrl =
                          photo.urls?.regular || photo.urls?.small || photo.urls?.thumb || '';
                        const newItem = {
                          id: Date.now().toString(),
                          type: 'image' as const,
                          title: title.slice(0, 80),
                          content: imageUrl,
                          date: new Date().toLocaleString(),
                          tags: ['unsplash', 'image'],
                        };
                        items.unshift(newItem);
                        localStorage.setItem('vaultItems', JSON.stringify(items.slice(0, 50)));
                      } catch (err) {
                        console.error('Error saving image to vault:', err);
                      }
                    }}
                    className="px-2 py-1 rounded-full bg-background/90 border border-border text-xs text-primary hover:bg-primary/10"
                  >
                    Save to Vault
                  </button>
                </div>
              )}
            </div>
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
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
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

          {renderPhotosMain()}

          {favourites.length > 0 && (
            <div className="mt-10 space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Heart className="w-6 h-6 text-primary fill-primary" aria-hidden />
                Favourites
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {favourites.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
                  >
                    <a
                      href={photo.links?.html || 'https://unsplash.com'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavourite(photo);
                      }}
                      className="absolute top-2 right-2 p-2 rounded-full bg-background/80 border border-border hover:bg-primary/20 transition-colors"
                      title="Remove from favourites"
                      aria-label="Remove from favourites"
                    >
                      <Heart className="w-5 h-5 fill-primary text-primary" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
