// Vercel Edge Middleware — maintenance mode toggle.
// Set MAINTENANCE_MODE=1 in Vercel environment variables to activate.
// Unset (or set to anything other than "1") to deactivate.

export const config = {
  // Skip the maintenance page itself and all static assets it needs,
  // so there's no redirect loop and the page renders correctly.
  matcher: '/((?!maintenance\\.html|brand/|favicon\\.|apple-touch-icon|og-image|screenshots).*)',
}

export default function middleware(request) {
  if (process.env.MAINTENANCE_MODE === '1') {
    return Response.redirect(new URL('/maintenance.html', request.url), 307)
  }
}
