/**
 * TED's image hosts, as allowed for next/image in next.config.ts. An image
 * URL from anywhere else must not reach <Image>: next/image throws on a host
 * it was not configured for, which would take the whole list down with it.
 */
export function isTedImageUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return (
    (url.hostname === 'pi.tedcdn.com' && url.pathname.startsWith('/r/')) ||
    (url.hostname === 'pe.tedcdn.com' && url.pathname.startsWith('/images/ted/'))
  )
}
