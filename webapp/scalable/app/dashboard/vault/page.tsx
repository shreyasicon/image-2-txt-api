'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { VaultCard } from '@/components/vault-card';
import { GlassCard } from '@/components/glass-card';
import { GlowButton } from '@/components/glow-button';
import { ArrowLeft, Trash2, Filter } from 'lucide-react';

interface VaultItem {
  id: string;
  type: 'image' | 'caption' | 'text';
  title: string;
  content: string;
  date: string;
  tags?: string[];
}

export default function VaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'caption' | 'text' | 'image'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load items from localStorage
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
  }, []);

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      const updated = items.filter((item) => item.id !== id);
      setItems(updated);
      localStorage.setItem('vaultItems', JSON.stringify(updated));
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all vault items? This cannot be undone.')) {
      setItems([]);
      localStorage.setItem('vaultItems', JSON.stringify([]));
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesFilter = filter === 'all' || item.type === filter;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-2">
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </div>
            <h1 className="text-4xl font-orbitron font-bold">
              Your <span className="neon-text">Vault</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Store, manage, and organize your content
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{items.length}</p>
            <p className="text-sm text-muted-foreground">items stored</p>
          </div>
        </div>

        {/* Search and Filter */}
        <GlassCard className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium mb-2">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or content..."
                className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Filter</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              >
                <option value="all">All Items</option>
                <option value="caption">Captions</option>
                <option value="text">Text</option>
                <option value="image">Images</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border/50">
            <Link href="/dashboard/upload" className="flex-1">
              <GlowButton variant="primary" className="w-full">
                Add New Content
              </GlowButton>
            </Link>
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors font-medium"
                title="Delete all items"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </GlassCard>

        {/* Content Grid */}
        {isLoading ? (
          <GlassCard className="text-center py-12">
            <p className="text-muted-foreground">Loading your vault...</p>
          </GlassCard>
        ) : filteredItems.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredItems.length} of {items.length} items
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
              <h3 className="text-xl font-bold mb-2">No content found</h3>
              <p className="text-muted-foreground mb-6">
                {items.length === 0
                  ? 'Start by uploading an image or extracting text'
                  : 'No items match your search or filter'}
              </p>
              {items.length === 0 ? (
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
