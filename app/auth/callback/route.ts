import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { safeNextPath } from '@/lib/auth/next-path'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const CallbackQuery = z.object({
  code: z.string().min(1).max(500).optional(),
  next: z.string().max(500).optional(),
})

/**
 * Where the emailed sign-in link lands. Swaps the one-time code for a session
 * (cookies set on this response), then continues to the page the reader came
 * from. A used, expired or forged link goes back to the sign-in page with a
 * reason instead of failing silently.
 */
export async function GET(request: NextRequest) {
  const query = CallbackQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  const next = safeNextPath(query.success ? query.data.next : undefined)
  const failed = new URL('/login', request.nextUrl.origin)
  failed.searchParams.set('error', 'link')
  failed.searchParams.set('next', next)

  const code = query.success ? query.data.code : undefined
  const supabase = await createSupabaseServerClient()
  if (!code || !supabase) return NextResponse.redirect(failed)

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.warn('[auth] sign-in link rejected:', error.message)
    return NextResponse.redirect(failed)
  }
  return NextResponse.redirect(new URL(next, request.nextUrl.origin))
}
