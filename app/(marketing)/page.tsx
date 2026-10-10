import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { TranscriptPreview } from '@/components/marketing/TranscriptPreview'
import { UrlForm } from '@/components/marketing/UrlForm'
import { Reveal } from '@/components/ui/reveal'
import { FEATURED_TALKS } from '@/lib/featured-talks'

const STEPS = ['one', 'two', 'three'] as const
const FEATURE_GROUPS = [
  { key: 'listen', items: ['sync', 'bilingual', 'search', 'export'] },
  { key: 'learn', items: ['cards', 'book', 'srs', 'quiz'] },
] as const
const FAQ = ['1', '2', '3', '4', '5', '6'] as const

export default function LandingPage() {
  const t = useTranslations()

  return (
    <div className="flex min-h-screen-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero ------------------------------------------------------------ */}
        <Reveal as="section" id="start" className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 sm:px-6 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink sm:text-sm">
            {t('hero.badge')}
          </p>

          <h1 className="mt-5 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t('hero.title')}
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
            {t('hero.subtitle')}
          </p>

          <div className="mt-8 max-w-xl">
            <UrlForm />
          </div>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24" delayMs={80}>
          <TranscriptPreview />
        </Reveal>

        {/* How it works ---------------------------------------------------- */}
        <section id="how" className="border-t border-line bg-raised/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {t('steps.title')}
              </h2>
              <p className="mt-3 max-w-lg text-muted">{t('steps.subtitle')}</p>
            </Reveal>

            <ol className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, index) => (
                <Reveal
                  as="li"
                  key={step}
                  delayMs={index * 60}
                  className="rounded-card border border-line bg-surface p-6"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-ink font-mono text-sm text-canvas">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`steps.${step}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(`steps.${step}.body`)}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Sample talks ---------------------------------------------------- */}
        <section id="try" className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('try.title')}</h2>
              <p className="mt-3 max-w-xl text-muted text-pretty">{t('try.subtitle')}</p>
            </Reveal>

            <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {FEATURED_TALKS.map((talk, index) => (
                <Reveal as="li" key={talk.slug} delayMs={(index % 4) * 60}>
                  <Link
                    href={`/watch/ted/${talk.slug}`}
                    aria-label={t('try.open', { title: talk.title, speaker: talk.speaker })}
                    className="flex h-full min-h-11 flex-col rounded-card border border-line bg-surface p-5 hover:border-accent-line"
                  >
                    <span className="font-semibold leading-snug text-balance">{talk.title}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm text-muted">
                      <span className="truncate">{talk.speaker}</span>
                      <span className="shrink-0 font-mono text-xs text-faint">
                        {t('try.minutes', { minutes: Math.round(talk.durationMs / 60_000) })}
                      </span>
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Features -------------------------------------------------------- */}
        <section id="features" className="border-t border-line bg-raised/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {t('features.title')}
              </h2>
            </Reveal>

            {FEATURE_GROUPS.map((group) => (
              <div key={group.key} className="mt-12 first-of-type:mt-10">
                <Reveal>
                  <h3 className="text-sm font-semibold tracking-wide text-accent-ink uppercase">
                    {t(`features.${group.key}.title`)}
                  </h3>
                </Reveal>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6">
                  {group.items.map((item, index) => (
                    <Reveal
                      as="article"
                      key={item}
                      delayMs={(index % 2) * 60}
                      className="rounded-card border border-line bg-surface p-6 sm:p-7"
                    >
                      <h4 className="text-lg font-semibold">{t(`features.${group.key}.${item}.title`)}</h4>
                      <p className="mt-2 leading-relaxed text-muted text-pretty">
                        {t(`features.${group.key}.${item}.body`)}
                      </p>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ ------------------------------------------------------------- */}
        <section id="faq" className="border-t border-line">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('faq.title')}</h2>
            </Reveal>

            <dl className="mt-8 flex flex-col">
              {FAQ.map((n, index) => (
                <Reveal key={n} delayMs={index * 60} className="border-b border-line py-6">
                  <dt className="font-medium">{t(`faq.q${n}`)}</dt>
                  <dd className="mt-2 leading-relaxed text-muted text-pretty">{t(`faq.a${n}`)}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing CTA ----------------------------------------------------- */}
        <section className="border-t border-line bg-raised/40">
          <Reveal className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('cta.title')}</h2>
            <p className="mt-3 text-muted">{t('cta.subtitle')}</p>
            <div className="mx-auto mt-8 max-w-xl text-left">
              <UrlForm size="md" />
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
