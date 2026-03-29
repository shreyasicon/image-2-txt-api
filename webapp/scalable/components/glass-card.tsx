import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

export function GlassCard({
  children,
  interactive = false,
  className,
  ...props
}: Readonly<GlassCardProps>) {
  return (
    <div
      className={cn(
        'glass-card p-6 transition-all duration-300',
        interactive && 'hover:border-primary/50 hover:shadow-[0_0_20px_rgba(0,255,255,0.2)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
