'use client';

import '@/app/globals.css';
import { AppErrorFallback } from '@/components/app-error-fallback';

export default function GlobalErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <AppErrorFallback {...props} />
      </body>
    </html>
  );
}
