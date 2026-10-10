import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }

/**
 * next/og's built-in font covers basic Latin only, so "Dự Án" would come out
 * as boxes. Be Vietnam Pro (SIL Open Font License) is fetched from Google
 * Fonts subset to exactly the characters drawn, a few kilobytes. If that fetch
 * fails the image still renders with the default font — a share preview must
 * never take a page down.
 */
async function vietnameseFont(text: string, weight: 600 | 700): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@${String(weight)}&text=${encodeURIComponent(text)}`,
        { cache: 'force-cache' },
      )
    ).text()
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1]
    if (!url) return null
    const font = await fetch(url, { cache: 'force-cache' })
    return font.ok ? await font.arrayBuffer() : null
  } catch {
    return null
  }
}

interface OgCardProps {
  appName: string
  /** Big line: the talk title, or the tagline on the home card. */
  title: string
  /** Small line under it: speaker, or a short description. */
  subtitle?: string
  /** Footer note, e.g. the licence line on talk cards. */
  note?: string
}

/** One look for every share preview: warm paper, ink type, amber mark — the site's own tokens. */
export async function renderOgCard({ appName, title, subtitle, note }: OgCardProps): Promise<ImageResponse> {
  const text = `${appName}${title}${subtitle ?? ''}${note ?? ''}`
  const [bold, semibold] = await Promise.all([vietnameseFont(text, 700), vietnameseFont(text, 600)])
  const fonts = [
    ...(bold ? [{ name: 'Be Vietnam Pro', data: bold, weight: 700 as const, style: 'normal' as const }] : []),
    ...(semibold ? [{ name: 'Be Vietnam Pro', data: semibold, weight: 600 as const, style: 'normal' as const }] : []),
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: '#fbfaf7',
          color: '#16150f',
          fontFamily: fonts.length > 0 ? 'Be Vietnam Pro' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: '#16150f',
              color: '#fbfaf7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {appName.charAt(0)}
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{appName}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ width: 96, height: 8, borderRadius: 4, background: '#b45309' }} />
          <div style={{ fontSize: title.length > 60 ? 54 : 66, fontWeight: 700, lineHeight: 1.12, maxWidth: 1050 }}>
            {title}
          </div>
          {subtitle ? <div style={{ fontSize: 34, color: '#6b6760', fontWeight: 600 }}>{subtitle}</div> : null}
        </div>

        <div style={{ fontSize: 24, color: '#98938a', fontWeight: 600 }}>{note ?? ''}</div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  )
}
