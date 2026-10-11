import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublicEnv } from '@/lib/supabase/env'

/**
 * Keeps the Supabase session fresh. Access tokens are short-lived; reading the
 * user here refreshes an expired one and writes the new cookies onto the
 * response, so Server Components (which cannot set cookies) always see a
 * valid session.
 *
 * Does nothing at all when Supabase is not configured.
 */
export async function middleware(request: NextRequest) {
  const env = supabasePublicEnv()
  if (!env) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  // Only for the refresh side effect. Visitors without a session cost one cookie
  // read: supabase-js skips the network call when there is no token at all.
  await supabase.auth.getUser()
  return response
}

export const config = {
  // Pages and actions only: no static files, images, share cards or metadata routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
