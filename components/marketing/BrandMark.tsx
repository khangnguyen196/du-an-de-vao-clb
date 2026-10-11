import Image from 'next/image'

/**
 * The site's avatar, the same artwork as the browser icon (`app/icon.svg`,
 * served by Next at /icon.svg). Decorative: the app name always sits next to it.
 */
export function BrandMark({ className, eager = false }: { className?: string; eager?: boolean }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={32}
      height={32}
      // A vector the browser scales itself; the image optimiser has nothing to add.
      unoptimized
      // In the header it is above the fold on every page: load it with the page, not lazily after.
      loading={eager ? 'eager' : 'lazy'}
      // Transparent artwork: no tile, no shadow — either would draw a box around it.
      className={className ?? 'size-8 shrink-0'}
    />
  )
}
