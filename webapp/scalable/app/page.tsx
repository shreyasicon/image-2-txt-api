'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { GlowButton } from '@/components/glow-button';
import { GlassCard } from '@/components/glass-card';
import { ArrowRight, Image, Zap, Tag, Vault } from 'lucide-react';

export default function LandingPage() {
  const features = [
    {
      icon: Image,
      title: 'Image to Text',
      description: 'Extract text from images using written API',
    },
    {
      icon: Zap,
      title: 'Translation',
      description: 'Translate text to your language',
    },
    {
      icon: Tag,
      title: 'Find Images',
      description: 'Find images related to your content',
    },
    {
      icon: Vault,
      title: 'Vault Storage',
      description: 'Store, organize and manage all your content in one place',
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Animated background grid */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition">
              Features
            </a>
            <Link href="/dashboard">
              <GlowButton variant="outline" size="sm">
                Launch App
              </GlowButton>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left - Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-orbitron font-bold tracking-tighter">
                <span className="neon-text">Create</span>
                <span className="block text-foreground">Store</span>
                <span className="block neon-text">Elevate</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
                Transform your content with API powered extraction, translation and image finding. Your personal vault for unlimited creativity.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/dashboard" className="w-full sm:w-auto">
                <GlowButton variant="primary" className="w-full sm:w-auto" size="lg">
                  Enter Vault <ArrowRight className="ml-2 w-4 h-4" />
                </GlowButton>
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-8">
              {[
                { label: 'APIs', value: '3+' },
                { label: 'Content Types', value: '∞' },
                { label: 'Processing Speed', value: 'Real time' },
              ].map((stat) => (
                <div key={stat.label} className="space-y-2">
                  <p className="text-2xl font-bold text-primary">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Visual */}
          <div className="relative h-96 sm:h-full min-h-96">
            <div className="absolute inset-0 glass-card flex items-center justify-center overflow-hidden">
              <div className="relative w-full h-full">
                {/* Animated vault visualization */}
                <svg
                  className="w-full h-full"
                  viewBox="0 0 400 400"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <filter id="vaultGlow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <radialGradient id="vaultGradient" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#00FFFF" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#5B21B6" stopOpacity="0.1" />
                    </radialGradient>
                  </defs>

                  {/* Outer rings */}
                  <circle cx="200" cy="200" r="180" fill="url(#vaultGradient)" filter="url(#vaultGlow)" />
                  <circle cx="200" cy="200" r="150" fill="none" stroke="#00FFFF" strokeWidth="2" opacity="0.4" />
                  <circle cx="200" cy="200" r="120" fill="none" stroke="#5B21B6" strokeWidth="2" opacity="0.3" />

                  {/* Central vault */}
                  <circle cx="200" cy="200" r="90" fill="none" stroke="#00FFFF" strokeWidth="3" filter="url(#vaultGlow)" />
                  <rect x="140" y="140" width="120" height="120" rx="10" fill="none" stroke="#00FFFF" strokeWidth="2" opacity="0.6" />

                  {/* Neural nodes */}
                  <circle cx="200" cy="200" r="6" fill="#00FFFF" />
                  <circle cx="260" cy="200" r="5" fill="#5B21B6" opacity="0.8" />
                  <circle cx="140" cy="200" r="5" fill="#5B21B6" opacity="0.8" />
                  <circle cx="200" cy="260" r="5" fill="#5B21B6" opacity="0.8" />
                  <circle cx="200" cy="140" r="5" fill="#5B21B6" opacity="0.8" />

                  {/* Connections */}
                  <line x1="200" y1="200" x2="260" y2="200" stroke="#00FFFF" strokeWidth="1" opacity="0.5" />
                  <line x1="200" y1="200" x2="140" y2="200" stroke="#00FFFF" strokeWidth="1" opacity="0.5" />
                  <line x1="200" y1="200" x2="200" y2="260" stroke="#00FFFF" strokeWidth="1" opacity="0.5" />
                  <line x1="200" y1="200" x2="200" y2="140" stroke="#00FFFF" strokeWidth="1" opacity="0.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl sm:text-5xl font-orbitron font-bold tracking-tight">
              Powerful <span className="neon-text">Features</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to extract, enhance and organize your creative content
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <GlassCard key={feature.title} interactive>
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <GlassCard className="text-center space-y-8 border-primary/30">
          <div className="space-y-3">
            <h2 className="text-4xl font-orbitron font-bold">
              Ready to Transform Your Content?
            </h2>
            <p className="text-lg text-muted-foreground">
              Start creating, storing and elevating your content today
            </p>
          </div>
          <Link href="/dashboard">
            <GlowButton variant="primary" size="lg">
              Enter Vault Now <ArrowRight className="ml-2 w-4 h-4" />
            </GlowButton>
          </Link>
        </GlassCard>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Logo />
            <p className="text-sm text-muted-foreground">
              © 2026 Iconic Vault. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
