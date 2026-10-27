import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { authCookieOptions } from './src/lib/supabase/auth-cookie';

const PUBLIC_PATHS = ['/auth/sign-in', '/auth/register', '/auth/mobile-only', '/auth/pending', '/auth/reset-password', '/auth/callback'];
const KNOWN_PATHS = new Set([
  '/', '/admin', '/api/internal/auto-time-out', '/api/internal/process-transactional-email', '/api/mobile/attendance', '/api/mobile/notifications', '/api/mobile/reports', '/api/mobile/registration/resubmit', '/api/mobile/schedule-proposals', '/api/registration/id-card', '/api/registration/submit', '/auth/callback', '/auth/callback/finish', '/auth/pending',
  '/auth/register', '/auth/mobile-only', '/auth/reset-password', '/auth/sign-in',
  '/coordinator/approvals', '/coordinator/assignments', '/coordinator/companies',
  '/coordinator/progress', '/coordinator/reports', '/coordinator/students', '/coordinator/import', '/coordinator/incident-reports', '/coordinator/submissions', '/coordinator/messages', '/coordinator/notifications',
  '/coordinator/supervisors', '/dashboard', '/health', '/map', '/program-head',
  '/program-head/reports', '/ready', '/robots.txt', '/settings', '/sitemap.xml',
  '/supervisor/attendance', '/supervisor/evaluations', '/supervisor/reports',
  '/supervisor/students', '/supervisor/messages', '/supervisor/notifications', '/verify-certificate', '/verify-certificate/search',
]);

function isKnownPath(path: string) {
  return KNOWN_PATHS.has(path) || /^\/(?:downloads\/[^/]+|verify-certificate\/[^/]+)$/.test(path);
}

function redirectToPath(request: NextRequest, path: string) {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : request.nextUrl.protocol.slice(0, -1);
  const host = request.headers.get('host');
  let origin = request.nextUrl.origin;
  if (host) {
    try {
      const parsedOrigin = new URL(`${protocol}://${host}`);
      if (parsedOrigin.hostname === '0.0.0.0') parsedOrigin.hostname = 'localhost';
      origin = parsedOrigin.origin;
    } catch { /* Fall back to the framework request origin. */ }
  }
  return NextResponse.redirect(new URL(path, origin));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, '') || '/';
  const isHealthProbe = path === '/health' || path === '/ready';
  const isLoopback = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(request.nextUrl.hostname);
  const isSecureRequest = (request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || request.nextUrl.protocol.slice(0, -1)) === 'https';
  // Keep HTTPS enforcement for deployed hosts while allowing local next start.
  if (
    !isHealthProbe && process.env.NODE_ENV === 'production' && !isLoopback &&
    request.headers.get('x-forwarded-proto') === 'http'
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  const nonce = crypto.randomUUID().replaceAll('-', '');
  let supabaseOrigin = '';
  let supabaseWsOrigin = '';
  try {
    const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    supabaseOrigin = backend.origin;
    supabaseWsOrigin = backend.protocol === 'https:' ? backend.origin.replace(/^https:/, 'wss:') : backend.origin.replace(/^http:/, 'ws:');
  } catch { /* CSP remains same-origin when backend config is missing. */ }
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin} https://nominatim.openstreetmap.org`,
    `img-src 'self' data: blob: ${supabaseOrigin} https://*.tile.openstreetmap.org https://firebasestorage.googleapis.com`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "worker-src 'self' blob:",
    ...(process.env.NODE_ENV === 'production' && isSecureRequest ? ['upgrade-insecure-requests'] : []),
  ].filter(Boolean).join('; ');
  const createSupabaseResponse = () => {
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set('x-nonce', nonce);
    forwardedHeaders.set('Content-Security-Policy', cspHeader);
    const response = NextResponse.next({ request: { headers: forwardedHeaders } });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  };
  let supabaseResponse = createSupabaseResponse();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Load balancer probes must not depend on a user session.
  if (path === '/health' || path === '/ready' || path === '/api/internal/process-transactional-email' || path === '/api/internal/auto-time-out' || path.startsWith('/api/mobile/') || path === '/api/registration/id-card' || path === '/api/registration/submit') return supabaseResponse;

  // Let Next render its real not-found response for unknown URLs. Auth redirects
  // should protect existing routes without disguising broken links as sign-in.
  if (!isKnownPath(path)) return supabaseResponse;
  
  // Public routes: root landing page, credential verification, public downloads, and auth screens
  const isPublic = 
    path === '/' || path === '/robots.txt' || path === '/sitemap.xml' ||
    path.startsWith('/verify-certificate') ||
    path.startsWith('/downloads') ||
    PUBLIC_PATHS.some(p => path.startsWith(p));

  // If Supabase credentials are missing or default placeholder, allow public paths
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-id')) {
    if (!isPublic) {
      return redirectToPath(request, '/auth/sign-in');
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = createSupabaseResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // Unauthenticated â€” redirect to sign in unless on public path
  if (!user && !isPublic) {
    return redirectToPath(request, '/auth/sign-in');
  }

  // Authenticated â€” redirect away from sign-in and register pages
  if (
    user &&
    (path === '/auth/sign-in' || path === '/auth/register')
  ) {
    return redirectToPath(request, '/dashboard');
  }

  // Defense-in-Depth: Route-Level Role-Based Access Control (RBAC) Guard
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('users').select('role, account_status').eq('user_id', user.id).single();
    if ((profileError || !profile || profile.account_status !== 'active') && !isPublic) {
      return redirectToPath(request, '/auth/pending');
    }
    const role = profile?.account_status === 'active' ? profile.role : null;
    if (role === 'Student' && !isPublic) {
      return redirectToPath(request, '/auth/mobile-only');
    }
    const isRoleGuardedPath =
      path.startsWith('/admin') ||
      path.startsWith('/coordinator') ||
      path.startsWith('/supervisor') ||
      path.startsWith('/program-head') ||
      path.startsWith('/student');

    if (!role && isRoleGuardedPath) {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }

    if (path.startsWith('/admin') && role !== 'Admin') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if (path.startsWith('/coordinator') && role !== 'Coordinator') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if ((path === '/coordinator/messages' || path === '/coordinator/notifications') && role !== 'Coordinator') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if (path.startsWith('/supervisor') && role !== 'Supervisor') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if ((path === '/supervisor/messages' || path === '/supervisor/notifications') && role !== 'Supervisor') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if (path.startsWith('/program-head') && role !== 'Coordinator') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
    if (path.startsWith('/student') && role !== 'Student') {
      return redirectToPath(request, '/dashboard?reason=unauthorized');
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
