'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** My Uploads has been merged into Vault. Redirect old links to Vault. */
export default function MyUploadsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/vault');
  }, [router]);
  return (
    <div className="p-6">
      <p className="text-muted-foreground">Redirecting to Vault…</p>
    </div>
  );
}
