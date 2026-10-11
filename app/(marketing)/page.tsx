import { useTranslations } from 'next-intl'
import { FeatureArt } from '@/components/marketing/FeatureArt'
import { FeatureRibbon } from '@/components/marketing/FeatureRibbon'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { TalkCard } from '@/components/marketing/TalkCard'
import { TranscriptPreview } from '@/components/marketing/TranscriptPreview'
import { UrlForm } from '@/components/marketing/UrlForm'
import { Reveal } from '@/components/ui/reveal'
import { FEATURED_TALKS } from '@/lib/featured-talks'
import { cn } from '@/lib/utils'

const STEPS = ['one', 'two', 'three'] as const
const NO_MORE = ['one', 'two', 'three', 'four', 'five', 'six'] as const
const FEATURE_GROUPS = [
  { key: 'listen', items: ['sync', 'bilingual', 'search', 'export'] },
  { key: 'learn', items: ['cards', 'book', 'srs', 'quiz'] },
] as const
const FAQ = ['1', '2', '3', '4', '5', '6'] as const

/** Wraps the `<g>…</g>` part of a heading in the brand gradient. */
const gradient = (chunks: React.ReactNode) => <span className="text-brand-gradient">{chunks}</span>

export default function LandingPage() {
  const t = useTranslations()

  return (
    <div className="flex min-h-screen-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero ------------------------------------------------------------ */}
        {/*
          Raised above the sections after it, and the glow clipped in its own
          layer rather than on the section: the link box's suggestion list
          drops below the hero and must not be cut off or painted over.
        */}
        <section className="relative isolate z-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="hero-glow" />
          </div>

          {/*
            Words on the left, the working demo on the right; stacked on a phone,
            words first so the link box stays near the top.
          */}
          <div
            id="start"
            className="mx-auto grid w-full max-w-6xl scroll-mt-24 gap-12 px-4 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-14"
          >
            <Reveal className="flex min-w-0 flex-col items-start">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur sm:text-sm">
                <span className="bg-brand-gradient size-2 rounded-full" aria-hidden />
                {t('hero.badge')}
              </p>

              <h1 className="mt-6 text-[2.5rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl lg:mt-8 lg:text-[3.5rem] xl:text-[4rem]">
                {t('hero.headline')}
                <span className="text-brand-gradient mt-3 block text-[1.75rem] leading-tight font-bold sm:text-4xl lg:text-[2.25rem] xl:text-[2.5rem]">
                  {t('hero.headlineAccent')}
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg lg:mt-7">
                {t('hero.subtitle')}
              </p>

              <div className="mt-8 w-full max-w-xl lg:mt-10">
                <UrlForm />
              </div>
            </Reveal>

            <Reveal delayMs={60} className="min-w-0">
              <TranscriptPreview />
            </Reveal>
          </div>

          <div className="mt-12 sm:mt-16">
            <FeatureRibbon />
          </div>
        </section>

        {/* Sample talks — first thing under the link box ------------------- */}
        <section id="try" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                {t.rich('try.title', { g: gradient })}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted text-pretty">{t('try.subtitle')}</p>
            </Reveal>

            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED_TALKS.map((talk, index) => (
                <Reveal as="li" key={talk.slug} delayMs={(index % 4) * 60}>
                  <TalkCard talk={talk} index={index} />
                </Reveal>
              ))}
            </ul>
            <p className="mt-6 text-center text-xs text-faint">{t('try.credit')}</p>
          </div>
        </section>

        {/* No more… -------------------------------------------------------- */}
        <section className="border-t border-line">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.25fr] lg:items-center lg:gap-16">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {t.rich('noMore.title', { g: gradient })}
              </h2>
              <p className="mt-3 text-2xl font-bold tracking-tight text-faint sm:text-3xl">{t('noMore.lead')}</p>
            </Reveal>

            <Reveal>
              <ul className="flex flex-col gap-3 sm:gap-4">
                {NO_MORE.map((item) => (
                  <li
                    key={item}
                    className="scroll-spot flex items-start gap-3 text-xl leading-snug font-semibold tracking-tight text-pretty sm:text-2xl"
                  >
                    <span aria-hidden className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-raised text-sm text-faint">
                      ✕
                    </span>
                    <span className="line-through decoration-faint/50 decoration-2">{t(`noMore.${item}`)}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* How it works ---------------------------------------------------- */}
        <section id="how" className="scroll-mt-24 border-t border-line bg-raised/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                {t.rich('steps.title', { g: gradient })}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted">{t('steps.subtitle')}</p>
            </Reveal>

            <ol className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, index) => (
                <Reveal
                  as="li"
                  key={step}
                  delayMs={index * 60}
                  className="rounded-card border border-line bg-surface p-6 shadow-sm"
                >
                  <span className="text-brand-gradient font-mono text-3xl font-bold">0{index + 1}</span>
                  <h3 className="mt-3 text-lg font-semibold">{t(`steps.${step}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(`steps.${step}.body`)}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features -------------------------------------------------------- */}
        <section id="features" className="scroll-mt-24 border-t border-line bg-raised/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="text-center">
              <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                {t.rich('features.title', { g: gradient })}
              </h2>
            </Reveal>

            {FEATURE_GROUPS.map((group, groupIndex) => (
              <div key={group.key} className="mt-14 first-of-type:mt-12">
                <Reveal>
                  <h3 className="text-sm font-semibold tracking-wide text-accent-ink uppercase">
                    {t(`features.${group.key}.title`)}
                  </h3>
                </Reveal>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-5">
                  {group.items.map((item, index) => (
                    <Reveal
                      as="article"
                      key={item}
                      delayMs={(index % 2) * 60}
                      className={cn(
                        'panel-mesh flex flex-col gap-5 rounded-[1.5rem] border border-line p-5 sm:p-7',
                        (index + groupIndex) % 2 === 1 && 'panel-mesh-alt',
                      )}
                    >
                      <div>
                        <h4 className="text-xl font-bold tracking-tight">{t(`features.${group.key}.${item}.title`)}</h4>
                        <p className="mt-2 leading-relaxed text-muted text-pretty">
                          {t(`features.${group.key}.${item}.body`)}
                        </p>
                      </div>
                      <div className="mt-auto">
                        <FeatureArt kind={item} />
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ ------------------------------------------------------------- */}
        <section id="faq" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">{t('faq.title')}</h2>
            </Reveal>

            <dl className="mt-10 flex flex-col gap-3">
              {FAQ.map((n, index) => (
                <Reveal key={n} delayMs={index * 60} className="rounded-card border border-line bg-surface p-5 sm:p-6">
                  <dt className="font-semibold">{t(`faq.q${n}`)}</dt>
                  <dd className="mt-2 leading-relaxed text-muted text-pretty">{t(`faq.a${n}`)}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing CTA ----------------------------------------------------- */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal className="relative isolate mx-auto w-full max-w-5xl px-5 py-14 text-center sm:px-10 sm:py-20">
            {/*
              The panel art sits in its own clipped layer, so the link box's
              suggestion list can open past the panel's edge.
            */}
            <div aria-hidden className="panel-mesh absolute inset-0 -z-10 rounded-[2rem] border border-line">
              <div
                className="orb-spin absolute top-1/2 left-1/2 -z-10 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
                style={{
                  background:
                    'conic-gradient(from 0deg, var(--color-brand-red), var(--color-brand-orange), var(--color-brand-violet), var(--color-brand-magenta), var(--color-brand-red))',
                }}
              />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
              {t.rich('cta.title', { g: gradient })}
            </h2>
            <p className="mt-4 text-muted">{t('cta.subtitle')}</p>
            <div className="mx-auto mt-8 max-w-xl text-left">
              <UrlForm size="md" align="center" />
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
