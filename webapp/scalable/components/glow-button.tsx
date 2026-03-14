import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
}

export function GlowButton({ 
  children, 
  variant = 'primary',
  className,
  ...props 
}: GlowButtonProps) {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:shadow-[0_0_20px_rgba(0,255,255,0.8)] border-primary',
    secondary: 'bg-secondary text-secondary-foreground hover:shadow-[0_0_20px_rgba(91,33,182,0.6)]',
    outline: 'border border-primary text-primary hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] bg-transparent',
  };

  return (
    <Button
      className={cn(
        'transition-all duration-300 font-semibold',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
