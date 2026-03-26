'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth-provider';
import {
  LayoutDashboard,
  Upload,
  Vault,
  Languages,
  ImageIcon,
  Settings,
  LogIn,
  LogOut,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { name: 'Upload', href: '/dashboard/upload', icon: <Upload className="w-5 h-5" /> },
  { name: 'Vault', href: '/dashboard/vault', icon: <Vault className="w-5 h-5" /> },
  { name: 'Translate', href: '/dashboard/translate', icon: <Languages className="w-5 h-5" /> },
  { name: 'Find Images', href: '/dashboard/images', icon: <ImageIcon className="w-5 h-5" /> },
  { name: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5" /> },
];

const ITEMS_REQUIRING_AUTH = ['/dashboard/settings', '/dashboard/vault'];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  // Only show auth-only items after auth has settled (prevents flash of Vault/Settings on refresh)
  const authReady = Boolean(auth && !auth.loading);
  const isLoggedIn = Boolean(authReady && auth?.user);
  const navItems = isLoggedIn
    ? ALL_NAV_ITEMS
    : ALL_NAV_ITEMS.filter((item) => !ITEMS_REQUIRING_AUTH.includes(item.href));

  return (
    <aside className="w-64 bg-background border-r border-border/50 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-border/50">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary rounded-sm flex items-center justify-center">
              <div className="w-2 h-2 bg-primary rounded-full" />
            </div>
          </div>
          <span className="text-sm font-orbitron font-bold text-primary">VAULT</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 group',
                isActive
                  ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(0,255,255,0.2)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <span className={cn(
                'transition-colors',
                isActive ? 'text-primary' : 'group-hover:text-primary'
              )}>
                {item.icon}
              </span>
              <span className="font-medium text-sm">{item.name}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: show only after auth ready to avoid flash */}
      <div className="border-t border-border/50 p-4 space-y-2">
        {!authReady ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">Loading…</div>
        ) : auth?.user ? (
          <button
            type="button"
            onClick={async () => {
              await auth.signOut();
              router.replace('/dashboard');
            }}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        ) : (
          <Link
            href="/dashboard/auth"
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300',
              pathname === '/dashboard/auth'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <LogIn className="w-5 h-5" />
            <span className="text-sm font-medium">Log in</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
