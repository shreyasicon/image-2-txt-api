import React from 'react';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-2 border-transparent border-t-primary border-r-primary rounded-full animate-spin"></div>
        <div className="absolute inset-2 border-2 border-transparent border-b-secondary rounded-full animate-spin-reverse"></div>
      </div>
    </div>
  );
}
