import type { Conjugations, WordItem, WordType } from '../types'

export const newStats = () => ({
  correctCount: 0,
  wrongCount: 0,
  lastReviewed: null as number | null,
  streak: 0,
  easeFactor: 2.5,
})

type Seed = [string, string, string | undefined, WordType, string[], Conjugations?]

const seeds: Seed[] = [
  ['먹다', 'essen', '[먹따]', 'verb', ['#Verb', '#Alltag', '#Kapitel1'],
    { presentPolite: '먹어요', presentFormal: '먹습니다', pastPolite: '먹었어요', futurePolite: '먹을 거예요' }],
  ['가다', 'gehen', undefined, 'verb', ['#Verb', '#Alltag', '#Kapitel1'],
    { presentPolite: '가요', presentFormal: '갑니다', pastPolite: '갔어요', futurePolite: '갈 거예요' }],
  ['하다', 'tun, machen', undefined, 'verb', ['#Verb', '#Grundlagen', '#Kapitel1'],
    { presentPolite: '해요', presentFormal: '합니다', pastPolite: '했어요', futurePolite: '할 거예요' }],
  ['읽다', 'lesen', '[익따]', 'verb', ['#Verb', '#Lernen', '#Kapitel2'],
    { presentPolite: '읽어요', presentFormal: '읽습니다', pastPolite: '읽었어요', futurePolite: '읽을 거예요' }],
  ['마시다', 'trinken', undefined, 'verb', ['#Verb', '#Alltag', '#Kapitel1'],
    { presentPolite: '마셔요', presentFormal: '마십니다', pastPolite: '마셨어요', futurePolite: '마실 거예요' }],
  ['좋다', 'gut sein, mögen', '[조타]', 'adjective', ['#Adjektiv', '#Alltag', '#Kapitel2'],
    { presentPolite: '좋아요', presentFormal: '좋습니다', pastPolite: '좋았어요', futurePolite: '좋을 거예요' }],
  ['학교', 'Schule', '[학꾜]', 'noun', ['#Nomen', '#Ort', '#Kapitel1']],
  ['학생', 'Schüler/in, Student/in', '[학쌩]', 'noun', ['#Nomen', '#Person', '#Kapitel1']],
  ['한국어', 'Koreanisch (Sprache)', '[한구거]', 'noun', ['#Nomen', '#Lernen', '#Kapitel2']],
  ['물', 'Wasser', undefined, 'noun', ['#Nomen', '#Essen', '#Kapitel1']],
  ['책', 'Buch', undefined, 'noun', ['#Nomen', '#Lernen', '#Kapitel2']],
  ['감사합니다', 'Danke (formell)', '[감사함니다]', 'other', ['#Phrase', '#Höflichkeit', '#Kapitel1']],
]

export function createDemoWords(): WordItem[] {
  const now = Date.now()
  return seeds.map(([korean, german, pronunciation, wordType, tags, conjugations], i) => ({
    id: `demo-${i + 1}`,
    korean,
    german,
    pronunciation,
    wordType,
    tags,
    createdAt: now - (seeds.length - i) * 60_000,
    conjugations,
    stats: newStats(),
  }))
}
