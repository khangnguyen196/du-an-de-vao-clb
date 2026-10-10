/**
 * Verb forms for phrasal-verb matching.
 *
 * A transcript says "kept running into", not "run into". Matching only the
 * dictionary form silently loses most of the phrasal verbs in a talk — and
 * phrasal verbs are the group a learner most needs, so losing them quietly is
 * the worst kind of miss.
 */

/** Only the verbs that actually head a phrasal verb in our list. */
const IRREGULAR: Readonly<Record<string, readonly string[]>> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  blow: ['blew', 'blown'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  build: ['built'],
  burn: ['burnt'],
  buy: ['bought'],
  catch: ['caught'],
  come: ['came'],
  cut: ['cutting', 'cuts'],
  deal: ['dealt'],
  draw: ['drew', 'drawn'],
  fall: ['fell', 'fallen'],
  find: ['found'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone', 'goes'],
  grow: ['grew', 'grown'],
  hang: ['hung'],
  hold: ['held'],
  keep: ['kept'],
  lay: ['laid'],
  leave: ['left'],
  let: ['letting', 'lets'],
  lose: ['lost'],
  make: ['made'],
  pay: ['paid'],
  put: ['putting', 'puts'],
  run: ['ran'],
  set: ['setting', 'sets'],
  shut: ['shutting', 'shuts'],
  sit: ['sat'],
  stand: ['stood'],
  stick: ['stuck'],
  take: ['took', 'taken'],
  tear: ['tore', 'torn'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  wear: ['wore', 'worn'],
  wipe: ['wiped'],
}

/** Short CVC verbs double the final consonant: run → running, cut → cutting. */
function doublesFinalConsonant(base: string): boolean {
  return base.length <= 4 && /[aeiou][bdglmnprt]$/.test(base)
}

/** Every surface form of a verb we are willing to match. */
export function verbForms(base: string): string[] {
  const forms = new Set<string>([base])

  forms.add(/(?:s|x|z|ch|sh)$/.test(base) ? `${base}es` : `${base}s`)

  if (base.endsWith('e')) {
    forms.add(`${base.slice(0, -1)}ing`)
    forms.add(`${base}d`)
  } else if (/[^aeiou]y$/.test(base)) {
    forms.add(`${base.slice(0, -1)}ies`)
    forms.add(`${base.slice(0, -1)}ied`)
    forms.add(`${base}ing`)
  } else if (doublesFinalConsonant(base)) {
    const doubled = base + base.slice(-1)
    forms.add(`${doubled}ing`)
    forms.add(`${doubled}ed`)
  } else {
    forms.add(`${base}ing`)
    forms.add(`${base}ed`)
  }

  for (const irregular of IRREGULAR[base] ?? []) forms.add(irregular)

  // Longest first so the regex prefers "running" over "run".
  return [...forms].sort((a, b) => b.length - a.length)
}
