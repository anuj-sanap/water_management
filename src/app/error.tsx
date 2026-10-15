'use client';

import { AppErrorFallback } from '@/components/app-error-fallback';

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorFallback {...props} />;
}
