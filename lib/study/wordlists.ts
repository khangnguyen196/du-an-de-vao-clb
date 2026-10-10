/**
 * Word data for candidate selection.
 *
 * These lists exist to answer one question cheaply: "would a B1+ learner
 * certainly already know this?" They are a filter, not a classifier — the final
 * call on which words earn a card, and which CEFR band they belong to, is made
 * downstream where there is judgement available.
 */

/**
 * Function words plus the everyday vocabulary any learner past beginner level
 * already owns. A card for `people` or `year` wastes the learner's time.
 */
const STOPWORD_SOURCE = `
a about above across after again against all almost alone along already also although always am among an and
another answer any anyone anything are around as ask asked at away back bad be became because become been
before began begin behind being believe below best better between big both bring brought but buy by call
called came can cannot car care carry case cause certain change child children choose city class clear close
come comes coming common company could country couple course create cut day days dead deal decide deep did
die difference different do does doing done door down draw drive during each early easy eat effect either
else end enough even ever every everyone everything exactly example eye eyes face fact fall family far
fast father feel feet felt few field find fine first five follow food foot for force found four friend
friends from front full game gave general get gets getting girl give given go goes going gone good got great
green group grow guess guy had half hand happen happened happy hard has have having he head hear heard heart
held help her here herself high him himself his hit hold home hope hour house how however human hundred
idea if important in inside instead into is it its itself job just keep kept kid kids kind knew know known
land large last late later laugh lead learn least leave left less let letter life light like line list little
live long look looked looking lose lost lot love low made make making man many may maybe me mean means meant
meet men might mile million mind minute miss moment money month more morning most mother move much music
must my myself name nation near need never new news next nice night no none nor not nothing notice now number
of off often oh old on once one only open or order other others our out over own page paper parent part
party pass past pay people perhaps person pick picture piece place plan play please point poor possible power
present president press pretty probably problem program public put question quick quickly quite radio rather
reach read ready real really reason receive record red remember report rest result return right rise road
room round run said same saw say says school sea second see seem seen self sell send sense sent serve set
seven several shall share she short should show side sign simple since sing single sir sister sit six size
sleep small so social some someone something sometimes son soon sort sound south space speak special stand
star start state stay step still stop story street strong student study such sudden suddenly summer sun
suppose sure surface system table take taken talk teach teacher team tell ten than thank that the their them
themselves then there these they thing things think third this those though thought three through throw thus
time times to today together told too took top toward town travel tree true try turn turned two under
understand until up upon us use used usually very view visit voice wait walk want war was watch water way we
week well went were what whatever when where whether which while white who whole whom whose why wide wife
will wind window wish with within without woman women word words work world would write written wrong year
years yes yet you young your yourself ourselves does okay yeah gonna wanna stuff folks guys lots
somebody anybody everybody nobody nothing somewhere anywhere everywhere
`

export const STOPWORDS: ReadonlySet<string> = new Set(
  STOPWORD_SOURCE.trim().split(/\s+/).filter(Boolean),
)

/**
 * Phrasal verbs are the group a dictionary lookup fails on, so they are matched
 * explicitly rather than guessed from a verb + particle pattern — that pattern
 * produces far too many false positives ("look at the", "go to work").
 */
export const PHRASAL_VERBS: readonly string[] = [
  'account for', 'add up', 'back down', 'back up', 'blow up', 'boil down to', 'break down', 'break out',
  'break through', 'break up', 'bring about', 'bring up', 'brush off', 'build up', 'burn out', 'call for',
  'call off', 'call out', 'carry on', 'carry out', 'catch on', 'catch up', 'check out', 'clear up',
  'come across', 'come apart', 'come down to', 'come out', 'come up', 'come up with', 'count on', 'cut back',
  'cut down', 'cut off', 'deal with', 'draw on', 'drop out', 'end up', 'fall apart', 'fall back on',
  'fall through', 'figure out', 'fill in', 'fill out', 'find out', 'follow through', 'follow up', 'get across',
  'get along', 'get around', 'get away with', 'get by', 'get over', 'get rid of', 'get through', 'give away',
  'give in', 'give off', 'give up', 'go ahead', 'go along with', 'go back', 'go on', 'go over', 'go through',
  'grow up', 'hand out', 'hand over', 'hang on', 'hold back', 'hold on', 'hold up', 'keep on', 'keep up',
  'lay off', 'lay out', 'let down', 'let go of', 'live up to', 'look after', 'look back', 'look down on',
  'look forward to', 'look into', 'look out', 'look up', 'make out', 'make up', 'make up for', 'move on',
  'narrow down', 'opt out', 'pass on', 'pay off', 'pick up', 'point out', 'pull off', 'pull together',
  'push back', 'put aside', 'put down', 'put off', 'put on', 'put together', 'put up with', 'reach out',
  'rule out', 'run into', 'run out', 'run out of', 'set aside', 'set off', 'set out', 'set up', 'settle down',
  'show up', 'shut down', 'sign up', 'sit back', 'sort out', 'stand out', 'stand up for', 'stick to',
  'stick with', 'sum up', 'take apart', 'take away', 'take back', 'take in', 'take off', 'take on',
  'take over', 'take up', 'talk about', 'tear down', 'think through', 'throw away', 'try out', 'turn down',
  'turn into', 'turn out', 'turn up', 'wear off', 'wipe out', 'work out', 'wrap up',
]

/**
 * Fixed expressions and collocations whose meaning is not the sum of the words.
 * Same reasoning as the phrasal verbs: matched explicitly, high precision.
 */
export const EXPRESSIONS: readonly string[] = [
  'a big deal', 'across the board', 'all along', 'all the way', 'as a matter of fact', 'at first glance',
  'at stake', 'at the end of the day', 'back and forth', 'be about to', 'beside the point', 'better off',
  'beyond doubt', 'bottom line', 'by and large', 'by no means', 'come to terms with', 'cutting edge',
  'draw the line', 'even though', 'far cry', 'few and far between', 'first and foremost', 'for the sake of',
  'from scratch', 'get the hang of', 'give or take', 'go hand in hand', 'hard-wired', 'have a hard time',
  'in a nutshell', 'in and of itself', 'in due course', 'in hindsight', 'in light of', 'in other words',
  'in terms of', 'in the first place', 'in the long run', 'in the wake of', 'it turns out', 'keep track of',
  'let alone', 'make a difference', 'make sense', 'make sure', 'no matter what', 'off the charts',
  'on the contrary', 'on the fly', 'on the other hand', 'on the verge of', 'once and for all', 'out of touch',
  'over and over', 'pay attention to', 'play a role', 'point of view', 'rule of thumb', 'set the stage',
  'shed light on', 'so far', 'take for granted', 'take into account', 'the odds are', 'to some extent',
  'turn a blind eye', 'under way', 'up to date', 'wear and tear', 'what it takes', 'with respect to',
]

/**
 * Latinate morphology is a strong register signal: a word ending in -tion,
 * -ity or -ism is far more likely to be academic than one that is not. Used to
 * order candidates, never to make a final decision on its own.
 */
export const ACADEMIC_SUFFIXES: readonly string[] = [
  'ation', 'ition', 'ution', 'ivity', 'ality', 'ility', 'ism', 'ist', 'ology', 'ogical', 'ical',
  'ance', 'ence', 'ancy', 'ency', 'ative', 'itive', 'eous', 'ious', 'uous', 'ate', 'ify', 'ise', 'ize',
]

/** Contraction tails left behind after stripping apostrophes. */
export const CONTRACTION_TAILS: ReadonlySet<string> = new Set(['s', 't', 're', 've', 'll', 'd', 'm'])
