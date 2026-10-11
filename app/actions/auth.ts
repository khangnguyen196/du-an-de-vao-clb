'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import type { ErrorCode } from '@/lib/errors'
import { safeNextPath } from '@/lib/auth/next-path'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const MagicLinkInput = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().max(500).optional(),
})

export type MagicLinkResult = { ok: true } | { ok: false; code: ErrorCode | 'INVALID_EMAIL' }

/** This deployment's own origin, from the request — Supabase only accepts redirect URLs on its allow list anyway. */
async function requestOrigin(): Promise<string> {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Emails a sign-in link. No password, no account form: the first link a new
 * address follows creates the account.
 *
 * Supabase's built-in mailer sends only a few emails an hour per project; past
 * that it answers 429, reported as RATE_LIMITED so the form can say so honestly.
 */
export async function sendMagicLink(input: unknown): Promise<MagicLinkResult> {
  const parsed = MagicLinkInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_EMAIL' }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, code: 'DB_UNAVAILABLE' }

  const callback = new URL('/auth/callback', await requestOrigin())
  callback.searchParams.set('next', safeNextPath(parsed.data.next))

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  })
  if (!error) return { ok: true }

  console.warn('[auth] magic link failed:', error.status, error.message)
  return { ok: false, code: error.status === 429 ? 'RATE_LIMITED' : 'INTERNAL' }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase?.auth.signOut()
}
