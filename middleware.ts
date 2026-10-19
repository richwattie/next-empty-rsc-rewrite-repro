import { NextResponse, type NextRequest } from 'next/server';

// With REWRITE_ORIGIN set, /target is proxied to another Next server (an
// external rewrite). Without it, /target is rewritten internally to
// /rewritten/target. Run one instance each way; see README.md.
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const origin = process.env.REWRITE_ORIGIN;
  const destination = origin
    ? new URL(`${pathname}${search}`, origin)
    : new URL(`/rewritten${pathname}${search}`, request.url);
  return NextResponse.rewrite(destination);
}

export const config = { matcher: ['/target'] };
