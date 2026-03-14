'use client';

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      {/* Vault Icon with Glow Effect */}
      <div className="relative">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          className="text-primary"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer glow effect */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="sparkGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00FFFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#5B21B6" stopOpacity="0.5" />
            </radialGradient>
          </defs>

          {/* Vault box */}
          <rect x="6" y="10" width="28" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" filter="url(#glow)" />

          {/* Vault door */}
          <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />

          {/* Lock mechanism */}
          <circle cx="20" cy="20" r="2" fill="currentColor" />

          {/* Neural spark inside - animated neural node */}
          <g>
            <circle cx="20" cy="20" r="3" fill="url(#sparkGradient)" opacity="0.8" />
            {/* Neural connections */}
            <line x1="20" y1="20" x2="26" y2="14" stroke="url(#sparkGradient)" strokeWidth="1" opacity="0.6" />
            <line x1="20" y1="20" x2="14" y2="26" stroke="url(#sparkGradient)" strokeWidth="1" opacity="0.6" />
            <line x1="20" y1="20" x2="26" y2="26" stroke="url(#sparkGradient)" strokeWidth="1" opacity="0.6" />
          </g>

          {/* Top shine effect */}
          <path d="M 8 12 Q 10 10 12 11" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>

      {/* Text Logo */}
      <div className="flex flex-col">
        <h1 className="font-orbitron font-bold text-xl tracking-wider text-primary neon-text">
          ICONIC VAULT
        </h1>
        <p className="text-xs text-muted-foreground font-sans tracking-widest">
          CREATE. STORE. ELEVATE.
        </p>
      </div>
    </div>
  );
}
