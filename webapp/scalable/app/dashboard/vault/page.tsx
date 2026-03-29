'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { listMyS3Links, type UserS3Link } from '@/lib/api';
import { VaultCard } from '@/components/vault-card';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { Trash2, Filter, ImageIcon } from 'lucide-react';

interface VaultItem {
  id: string;
  type: 'image' | 'caption' | 'text';
  title: string;
  content: string;
  date: string;
  tags?: string[];
}

export default function VaultPage() {
  const auth = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [s3Items, setS3Items] = useState<UserS3Link[]>([]);
  const [s3Error, setS3Error] = useState('');
  const [s3Loading, setS3Loading] = useState(false);
  const [extractedImages, setExtractedImages] = useState<{ id: string; jobId: string; filename: string; date: string; dataUrl: string }[]>([]);
  const [filter, setFilter] = useState<'all' | 'caption' | 'text'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [redirectFallback, setRedirectFallback] = useState(false);
  const [showAddImage, setShowAddImage] = useState(false);
  const [addImageTitle, setAddImageTitle] = useState('');
  const [addImageFile, setAddImageFile] = useState<File | null>(null);
  const [addImageSaving, setAddImageSaving] = useState(false);

  const loadS3Links = useCallback(async () => {
    if (!auth?.user || !auth.getIdToken) return;
    setS3Error('');
    setS3Loading(true);
    try {
      const data = await listMyS3Links(() => auth.getIdToken!());
      setS3Items(data?.items ?? []);
      // Do not show error on failure; empty list with friendly empty state is enough
    } catch {
      setS3Items([]);
    } finally {
      setS3Loading(false);
    }
  }, [auth?.user, auth?.getIdToken]);

  useEffect(() => {
    if (!auth?.isConfigured) {
      setIsLoading(false);
      return;
    }
    // Do not redirect or load until auth has finished loading (avoids redirect loop / vault "not opening")
    if (auth?.loading) return;
    if (!auth?.user) {
      router.replace('/dashboard');
      setIsLoading(false);
      return;
    }
    try {
      const stored = localStorage.getItem('vaultItems');
      if (stored) {
        const parsed = JSON.parse(stored);
        setItems(parsed);
      }
    } catch (error) {
      console.error('Error loading vault items:', error);
    } finally {
      setIsLoading(false);
    }
    loadS3Links();
  }, [auth?.user, auth?.isConfigured, auth?.loading, router, loadS3Links]);

  const EXTRACTED_IMAGES_KEY = 'extractedImages';
  const loadExtractedImages = useCallback(() => {
    try {
      const raw = localStorage.getItem(EXTRACTED_IMAGES_KEY);
      setExtractedImages(raw ? JSON.parse(raw) : []);
    } catch (_) {
      setExtractedImages([]);
    }
  }, []);
  useEffect(() => {
    loadExtractedImages();
    const onUpdate = () => loadExtractedImages();
    window.addEventListener('vault-stats-update', onUpdate);
    return () => window.removeEventListener('vault-stats-update', onUpdate);
  }, [loadExtractedImages]);

  // If auth never resolves (Cognito hang), redirect after auth timeout so page doesn't hang
  useEffect(() => {
    if (!auth?.isConfigured || auth?.user || !auth?.loading) return;
    const t = setTimeout(() => setRedirectFallback(true), 7000);
    return () => clearTimeout(t);
  }, [auth?.isConfigured, auth?.user, auth?.loading]);

  useEffect(() => {
    if (!redirectFallback) return;
    router.replace('/dashboard');
  }, [redirectFallback, router]);

  if (redirectFallback) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  if (auth?.loading || isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading your vault…</p>
      </div>
    );
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      const updated = items.filter((item) => item.id !== id);
      setItems(updated);
      localStorage.setItem('vaultItems', JSON.stringify(updated));
    }
  };

  const handleRemoveExtractedImage = (id: string) => {
    const next = extractedImages.filter((e) => e.id !== id);
    setExtractedImages(next);
    localStorage.setItem(EXTRACTED_IMAGES_KEY, JSON.stringify(next));
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all vault items? This cannot be undone.')) {
      setItems([]);
      localStorage.setItem('vaultItems', JSON.stringify([]));
    }
  };

  const maxImageSizeBytes = 2 * 1024 * 1024; // 2MB for localStorage
  const handleSaveImageToVault = () => {
    if (!addImageFile) return;
    if (addImageFile.size > maxImageSizeBytes) {
      alert('Image is too large (max 2 MB). Use a smaller image or the Upload page for larger files.');
      return;
    }
    setAddImageSaving(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newItem: VaultItem = {
        id: crypto.randomUUID(),
        type: 'image',
        title: addImageTitle.trim() || addImageFile.name || 'Saved image',
        content: dataUrl,
        date: new Date().toISOString().slice(0, 10),
      };
      const updated = [...items, newItem];
      setItems(updated);
      localStorage.setItem('vaultItems', JSON.stringify(updated));
      setAddImageFile(null);
      setAddImageTitle('');
      setShowAddImage(false);
      setAddImageSaving(false);
    };
    reader.onerror = () => {
      alert('Could not read the image.');
      setAddImageSaving(false);
    };
    reader.readAsDataURL(addImageFile);
  };

  /** Saved image entries from vault (e.g. Unsplash / Add New Content), not the Upload extractedImages list */
  const localVaultImages = items.filter((item) => item.type === 'image');

  /** Captions & text in the grid below — images show only under "Your uploaded images" */
  const nonImageVaultItems = items.filter((item) => item.type !== 'image');

  const filteredItems = nonImageVaultItems.filter((item) => {
    const matchesFilter = filter === 'all' || item.type === filter;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const hasAnyUploadedImage =
    s3Items.length > 0 || extractedImages.length > 0 || localVaultImages.length > 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-orbitron font-bold">
              Your <span className="neon-text">Vault</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Store, manage and organize your content
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{items.length + s3Items.length + extractedImages.length}</p>
            <p className="text-sm text-muted-foreground">items (saved + uploads + extracted)</p>
          </div>
        </div>

        {/* Uploaded / extracted images (Upload page, S3, and saved image vault items) */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" aria-hidden />
            Your uploaded images
          </h2>
          <p className="text-sm text-muted-foreground">
            Thumbnails from the Upload page, images stored on your account (S3), and other images you saved to the vault.
          </p>
          {s3Loading && !hasAnyUploadedImage ? (
            <GlassCard className="py-8 text-center text-muted-foreground">Loading your uploaded images…</GlassCard>
          ) : hasAnyUploadedImage ? (
            <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {s3Items.map((link) => (
                <li key={`s3-${link.jobId}`}>
                  <GlassCard className="overflow-hidden p-0">
                    <div className="aspect-square relative bg-muted">
                      {link.previewUrl ? (
                        <img
                          src={link.previewUrl}
                          alt={link.filename || 'Uploaded image'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-12 h-12" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Cloud upload</p>
                      <p className="text-sm font-medium truncate" title={link.filename}>{link.filename || link.jobId}</p>
                      {link.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">{new Date(link.createdAt).toLocaleString()}</p>
                      )}
                    </div>
                  </GlassCard>
                </li>
              ))}
              {extractedImages.map((img) => (
                <li key={`ex-${img.id}`}>
                  <GlassCard className="overflow-hidden p-0 group relative">
                    <div className="aspect-square relative bg-muted">
                      <img
                        src={img.dataUrl}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">From Upload</p>
                        <p className="text-sm font-medium truncate" title={img.filename}>{img.filename}</p>
                        <p className="text-xs text-muted-foreground">{img.date}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExtractedImage(img.id)}
                        className="p-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                        title="Remove from vault"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </GlassCard>
                </li>
              ))}
              {localVaultImages.map((item) => (
                <li key={`lv-${item.id}`}>
                  <GlassCard className="overflow-hidden p-0 group relative">
                    <div className="aspect-square relative bg-muted">
                      <img
                        src={item.content}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Saved to vault</p>
                        <p className="text-sm font-medium truncate" title={item.title}>{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                        title="Remove from vault"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>
          ) : (
            !s3Loading && (
              <GlassCard className="py-6 text-center text-muted-foreground space-y-2">
                <p>Images you upload via the Upload page will appear here.</p>
                <p className="text-sm">Cloud uploads (when signed in) and images you add with &quot;Add New Content&quot; show here too.</p>
              </GlassCard>
            )
          )}
        </div>

        {/* Search and Filter */}
        <GlassCard className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Search */}
            <div>
              <label
                htmlFor="vault-search"
                className="block text-sm font-medium mb-2"
              >
                Search
              </label>
              <input
                id="vault-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or content..."
                className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Filter */}
            <div>
              <label
                htmlFor="vault-filter"
                className="block text-sm font-medium mb-2"
              >
                Filter
              </label>
              <select
                id="vault-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              >
                <option value="all">All Items</option>
                <option value="caption">Captions</option>
                <option value="text">Text</option>
              </select>
            </div>
          </div>

          {/* Actions: Add New Content = inline store image (no redirect) */}
          <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
            {showAddImage ? (
              <GlassCard className="space-y-3 p-4">
                <p className="text-sm font-medium">Store an image in your vault</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAddImageFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-muted-foreground file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary"
                />
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={addImageTitle}
                  onChange={(e) => setAddImageTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  <GlowButton
                    variant="primary"
                    onClick={handleSaveImageToVault}
                    disabled={!addImageFile || addImageSaving}
                  >
                    {addImageSaving ? 'Saving…' : 'Save to Vault'}
                  </GlowButton>
                  <button
                    type="button"
                    onClick={() => { setShowAddImage(false); setAddImageFile(null); setAddImageTitle(''); }}
                    className="px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </GlassCard>
            ) : (
              <div className="flex gap-2">
                <GlowButton variant="primary" className="flex-1" onClick={() => setShowAddImage(true)}>
                  Add New Content
                </GlowButton>
                <Link href="/dashboard/upload" className="px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium inline-flex items-center">
                  Upload &amp; extract text
                </Link>
              </div>
            )}
            {items.length > 0 && !showAddImage && (
              <button
                onClick={handleClearAll}
                className="self-start px-4 py-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors font-medium"
                title="Delete all items"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </GlassCard>

        {/* Content Grid */}
        {filteredItems.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredItems.length} of {nonImageVaultItems.length} items
              {nonImageVaultItems.length > 0 ? ' (captions & text)' : ''}
            </p>
            <div className="grid gap-4">
              {filteredItems.map((item) => (
                <VaultCard
                  key={item.id}
                  {...item}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        ) : (
          <GlassCard className="text-center space-y-4 border-primary/30 py-12">
            <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
              <Filter className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">
                {nonImageVaultItems.length === 0 ? 'No captions or text yet' : 'No matching items'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {nonImageVaultItems.length === 0
                  ? 'Save captions or text to the vault, or use Upload to extract text. Images are listed above.'
                  : 'Try another search or filter. Images stay in the section above.'}
              </p>
              {nonImageVaultItems.length === 0 ? (
                <Link href="/dashboard/upload">
                  <GlowButton variant="primary">Upload Content</GlowButton>
                </Link>
              ) : (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilter('all');
                  }}
                  className="text-primary hover:underline text-sm"
                >
                  Clear filters
                </button>
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
