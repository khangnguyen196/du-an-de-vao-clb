import Image from 'next/image'

/**
 * The site's avatar, the same artwork as the browser icon (`app/icon.svg`,
 * served by Next at /icon.svg). Decorative: the app name always sits next to it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={32}
      height={32}
      // A vector the browser scales itself; the image optimiser has nothing to add.
      unoptimized
      className={className ?? 'size-8 shrink-0 rounded-[0.6rem] shadow-sm'}
    />
  )
}
