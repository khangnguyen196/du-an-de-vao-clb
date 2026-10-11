/**
 * Where to send someone after signing in, kept to this site.
 *
 * Only a plain in-app path is accepted. "//evil.example" and "/\evil.example"
 * are read by browsers as other hosts, and anything absolute is somebody
 * else's site — an open redirect through our own sign-in link.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (/[\u0000-\u001f]/.test(next)) return '/'
  return next
}
