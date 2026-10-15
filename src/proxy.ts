import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { canAccessRoute } from '@/lib/rbac';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;

  // Allow public auth endpoints, static assets, and friendly error pages.
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/403'
  ) {
    return NextResponse.next();
  }

  // 2. Handle /login page: redirect to projects or returnTo if already logged in
  if (pathname === '/login') {
    if (isLoggedIn) {
      const returnTo = nextUrl.searchParams.get('returnTo');
      return NextResponse.redirect(new URL(returnTo || '/projects', req.url));
    }
    return NextResponse.next();
  }

  // 3. Unauthenticated access redirect to /login with returnTo parameter
  if (!isLoggedIn) {
    const returnTo = encodeURIComponent(pathname + nextUrl.search);
    return NextResponse.redirect(new URL(`/login?returnTo=${returnTo}`, req.url));
  }

  // 4. Role-based Route Access Control (RBAC)
  const access = canAccessRoute(userRole, pathname);
  if (!access.allowed) {
    const forbiddenUrl = new URL('/403', req.url);
    forbiddenUrl.searchParams.set('from', pathname);
    forbiddenUrl.searchParams.set('reason', access.reason || 'unauthorized');
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
