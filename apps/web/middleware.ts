import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const has = req.cookies.has('at') || req.cookies.has('rt');
  if (!has && !req.nextUrl.pathname.startsWith('/login')) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
