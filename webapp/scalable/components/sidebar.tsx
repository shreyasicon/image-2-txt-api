'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Upload,
  Vault,
  Zap,
  Languages,
  ImageIcon,
  Settings,
  LogOut,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { name: 'Upload', href: '/dashboard/upload', icon: <Upload className="w-5 h-5" /> },
  { name: 'Vault', href: '/dashboard/vault', icon: <Vault className="w-5 h-5" /> },
  { name: 'AI Tools', href: '/dashboard/ai-tools', icon: <Zap className="w-5 h-5" /> },
  { name: 'Translate', href: '/dashboard/translate', icon: <Languages className="w-5 h-5" /> },
  { name: 'Find Images', href: '/dashboard/images', icon: <ImageIcon className="w-5 h-5" /> },
  { name: 'Settings', href: '/dashboard/settings', icon: <Settings className="w-5 h-5" /> },
];

export function Sidebar() {
  const pathname = usePathname();

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

      {/* Footer */}
      <div className="border-t border-border/50 p-4 space-y-2">
        <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300">
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
