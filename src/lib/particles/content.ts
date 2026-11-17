/**
 * Partikel-Kapitel: eigene Erklärungen auf Grundlage der Kursunterlagen (nicht wörtlich übernommen).
 * Eine Partikel = ein Kapitel, ihre Verwendungen = Lektionen.
 */
import type { ParticleId } from './forms'

export interface Lesson {
  id: string
  title: string
  /** Ein Satz zur Verwendung */
  rule: string
}

export interface Example {
  ko: string
  de: string
}

export interface ParticleChapter {
  id: ParticleId
  /** Empfohlene Reihenfolge (1–10) */
  order: number
  /** Anzeige der Formen, z. B. „이 / 가“ */
  forms: string
  name: string
  short: string
  color: string
  lessons: Lesson[]
  /** Regel in 2–4 Sätzen */
  rule: string
  /** Formregel (falls die Form vom letzten Laut abhängt) */
  formRule?: { consonant: string; vowel: string }
  memory: string
  examples: Example[]
  /** Typische Verwechslungen und Stolperfallen */
  pitfalls: string[]
}

export const CHAPTERS: ParticleChapter[] = [
  {
    id: 'ga', order: 1, forms: '이 / 가', name: 'Subjekt-Partikel', short: 'markiert, wer oder was etwas tut oder ist', color: '#0a84ff',
    lessons: [
      { id: 'basis', title: 'Subjekt markieren', rule: '이/가 hängt am Subjekt: wer etwas tut, wer oder was irgendwo ist.' },
      { id: 'sonder', title: 'Sonderformen 내가 · 제가 · 네가', rule: '나, 저 und 너 verschmelzen mit 가: 내가, 제가, 네가.' },
    ],
    rule: 'Die Partikel 이/가 zeigt das Subjekt eines Satzes an – also wer handelt oder worüber etwas ausgesagt wird. Sie steht direkt am Nomen, ohne Leerzeichen. Besonders oft steht sie bei neuer Information, bei Fragewörtern (누가? – wer?) und bei 있어요/없어요.',
    formRule: { consonant: '이 nach Endkonsonant: 학생이, 선생님이', vowel: '가 nach Vokal: 친구가, 의사가' },
    memory: 'Konsonant trifft Vokal: 학생 endet hart → das weiche 이 schließt an. 친구 endet weich → 가 bringt den Konsonanten mit.',
    examples: [
      { ko: '친구가 와요.', de: 'Ein Freund kommt.' },
      { ko: '학생이 공부해요.', de: 'Der Student lernt.' },
      { ko: '누가 커피를 마셔요? – 제가 마셔요.', de: 'Wer trinkt Kaffee? – Ich trinke ihn.' },
      { ko: '고양이가 있어요.', de: 'Es gibt eine Katze. / Ich habe eine Katze.' },
    ],
    pitfalls: [
      '나 + 가 wird zu 내가, 저 + 가 zu 제가, 너 + 가 zu 네가 – nie „저가“.',
      '이/가 und 은/는 können oft beide stehen. 이/가 betont das Subjekt als neue Info („DER FREUND kommt“), 은/는 das Thema („Was den Freund angeht …“).',
      'Nach Fragewörtern wie 누가 (wer) und 뭐가 (was) steht immer die Form mit 가.',
    ],
  },
  {
    id: 'reul', order: 2, forms: '을 / 를', name: 'Objekt-Partikel', short: 'markiert, was man isst, trinkt, kauft …', color: '#30d158',
    lessons: [
      { id: 'basis', title: 'Objekt markieren', rule: '을/를 hängt am direkten Objekt – das, worauf sich die Handlung richtet. Im Gespräch fällt es oft weg.' },
      { id: 'verwechslung', title: '좋아해요 oder 좋아요?', rule: '좋아해요/싫어해요 nehmen 을/를, 좋아요/싫어요 nehmen 이/가.' },
    ],
    rule: 'Die Partikel 을/를 markiert das direkte Objekt (deutsch meist der Akkusativ): was man isst, trinkt, liest, kauft, lernt. Im Koreanischen steht das Objekt vor dem Verb.',
    formRule: { consonant: '을 nach Endkonsonant: 물을, 빵을', vowel: '를 nach Vokal: 커피를, 바나나를' },
    memory: 'Frage „Wen oder was?“ – die Antwort bekommt 을/를.',
    examples: [
      { ko: '물을 마셔요.', de: 'Ich trinke Wasser.' },
      { ko: '바나나를 먹어요.', de: 'Ich esse eine Banane.' },
      { ko: '한국어를 공부해요.', de: 'Ich lerne Koreanisch.' },
      { ko: '뭐 먹어요? – 김치 먹어요.', de: 'Was isst du? – Ich esse Kimchi. (umgangssprachlich ohne 를)' },
    ],
    pitfalls: [
      'Nicht jedes deutsche Akkusativ-Objekt bekommt 을/를: bei 좋아요 (gefällt) steht 이/가 – 커피가 좋아요, aber 커피를 좋아해요.',
      '뭐 ist schon die Kurzform von 무엇을 – „뭐를“ geht, ist aber umgangssprachlich.',
      'Wer zu jemandem geht, braucht 에게/한테, nicht 을/를.',
    ],
  },
  {
    id: 'neun', order: 3, forms: '은 / 는', name: 'Themen-Partikel', short: '„was … angeht“ – Thema und Gegensatz', color: '#ff9f0a',
    lessons: [
      { id: 'thema', title: 'Thema des Satzes', rule: '은/는 stellt das Thema vor: „Was mich angeht, …“ – typisch bei Vorstellungen.' },
      { id: 'kontrast', title: 'Gegensatz', rule: 'Mit 은/는 stellt man zwei Dinge gegenüber: „Kaffee ja, Tee nicht.“' },
    ],
    rule: 'Die Partikel 은/는 markiert das Thema: worüber der Satz spricht. Man kann sie oft mit „was … angeht“ übersetzen. Sie stellt außerdem Gegensätze heraus, wenn zwei Dinge verglichen werden.',
    formRule: { consonant: '은 nach Endkonsonant: 이름은, 텔레비전은', vowel: '는 nach Vokal: 저는, 라디오는' },
    memory: '은/는 = Scheinwerfer auf das Thema. Zwei Scheinwerfer im Satz = Gegensatz.',
    examples: [
      { ko: '저는 독일 사람이에요.', de: 'Ich bin Deutsche(r).' },
      { ko: '제 이름은 레나예요.', de: 'Mein Name ist Lena.' },
      { ko: '텔레비전은 비싸요. 그런데 라디오는 싸요.', de: 'Der Fernseher ist teuer, das Radio aber billig.' },
      { ko: '오늘은 날씨가 좋아요.', de: 'Heute (im Gegensatz zu sonst) ist das Wetter schön.' },
    ],
    pitfalls: [
      'Bei Fragewörtern nie 은/는: 누가 왔어요? (nicht „누는“).',
      'In Vorstellungen steht fast immer 은/는: 저는 …, 제 이름은 ….',
      '오늘 날씨가 좋아요 = neutral; 오늘은 날씨가 좋아요 = „heute jedenfalls“ (Gegensatz zu anderen Tagen).',
    ],
  },
  {
    id: 'gwa', order: 4, forms: '과 / 와 · 하고', name: '„und“ / „mit“', short: 'verbindet Nomen, oder „zusammen mit“', color: '#bf5af2',
    lessons: [
      { id: 'und', title: '„und“ zwischen Nomen', rule: '과/와 und 하고 verbinden zwei Nomen wie „und“ – nie ganze Sätze.' },
      { id: 'mit', title: '„mit jemandem“', rule: 'Mit 같이/함께 bedeutet 과/와/하고 „zusammen mit“.' },
    ],
    rule: 'Die Partikeln 과/와 und 하고 verbinden zwei Nomen („Brot und Milch“) oder bedeuten „mit jemandem zusammen“ (oft mit 같이 oder 함께). 하고 ist gesprochen häufiger, 과/와 eher schriftlich. Beide Varianten sind richtig.',
    formRule: { consonant: '과 nach Endkonsonant: 빵과, 꽃과', vowel: '와 nach Vokal: 우유와, 어머니와' },
    memory: 'Achtung, hier ist es umgekehrt: Bei 과/와 kommt das 과 (mit Konsonant am Anfang) nach dem Konsonanten.',
    examples: [
      { ko: '빵과 우유를 사요.', de: 'Ich kaufe Brot und Milch.' },
      { ko: '우유와 바나나를 사요.', de: 'Ich kaufe Milch und Bananen.' },
      { ko: '어머니하고 같이 스파게티를 먹어요.', de: 'Ich esse mit meiner Mutter Spaghetti.' },
      { ko: '주스하고 빵하고 커피를 사요.', de: 'Ich kaufe Saft, Brot und Kaffee.' },
    ],
    pitfalls: [
      '과/와 verbinden nur Nomen. Zwei Sätze verbindet man mit 그리고 oder -고.',
      'Beim letzten Nomen der Aufzählung steht die Partikel seiner Rolle (z. B. 를), nicht 과/와.',
      '과 nach Konsonant, 와 nach Vokal – genau andersherum als bei 이/가.',
    ],
  },
  {
    id: 'do', order: 5, forms: '도', name: '„auch“', short: 'ersetzt 이/가 und 을/를: „auch“', color: '#ff375f',
    lessons: [{ id: 'auch', title: '„auch“', rule: '도 bedeutet „auch“ und ersetzt 이/가, 은/는 und 을/를.' }],
    rule: 'Die Partikel 도 bedeutet „auch“ oder „ebenfalls“. Sie ersetzt die Subjekt-, Themen- und Objektpartikel – man sagt also 차도 좋아해요, nicht „차를도“. Andere Partikeln wie 에 oder 에서 bleiben stehen: 집에서도 (auch zu Hause).',
    memory: '도 kennt nur eine Form und schiebt 이/가, 은/는, 을/를 einfach weg.',
    examples: [
      { ko: '저는 커피를 좋아해요. 차도 좋아해요.', de: 'Ich mag Kaffee. Tee mag ich auch.' },
      { ko: '케이크도 잘 만들어요.', de: 'Sie backt auch gut Kuchen.' },
      { ko: '저도 학생이에요.', de: 'Ich bin auch Student(in).' },
      { ko: '주말에도 일해요.', de: 'Ich arbeite auch am Wochenende.' },
    ],
    pitfalls: [
      'Nie doppelt: „차를도“ oder „저는도“ ist falsch – 도 ersetzt diese Partikeln.',
      '에, 에서, 에게 bleiben vor 도 erhalten: 학교에서도, 친구에게도.',
    ],
  },
  {
    id: 'man', order: 6, forms: '만', name: '„nur“', short: '„nur“, „lediglich“', color: '#ff6b35',
    lessons: [{ id: 'nur', title: '„nur“', rule: '만 bedeutet „nur“ und steht direkt hinter dem, was eingeschränkt wird.' }],
    rule: 'Die Partikel 만 bedeutet „nur“ oder „lediglich“. Sie steht direkt hinter dem Wort, das eingeschränkt wird. 이/가 oder 을/를 können danach noch folgen (만이, 만을), fallen aber meistens weg. Orts- und Zeitpartikeln stehen davor: 저녁에만 (nur abends).',
    memory: '만 = „nur dieses eine“ – es zeigt mit dem Finger auf genau ein Wort.',
    examples: [
      { ko: '엄마만 저를 사랑해요.', de: 'Nur meine Mutter liebt mich.' },
      { ko: '나는 너만 사랑해.', de: 'Ich liebe nur dich.' },
      { ko: '저녁에만 TV를 봐요.', de: 'Ich sehe nur abends fern.' },
      { ko: '물만 마셔요.', de: 'Ich trinke nur Wasser.' },
    ],
    pitfalls: [
      'Bei Orts- und Zeitangaben bleibt 에/에서 vor 만: 집에서만, 아침에만.',
      'Verwechslung mit 도: 만 = nur, 도 = auch – das Gegenteil!',
    ],
  },
  {
    id: 'ui', order: 7, forms: '의', name: 'Besitz-Partikel', short: '„von“, Besitz und Zugehörigkeit', color: '#64d2ff',
    lessons: [
      { id: 'besitz', title: 'Besitz und Zugehörigkeit', rule: '의 verbindet zwei Nomen: A의 B = „B von A“ / „As B“.' },
      { id: 'sonder', title: 'Sonderformen 내 · 제 · 네', rule: '나의 → 내, 저의 → 제, 너의 → 네.' },
    ],
    rule: 'Die Partikel 의 steht zwischen zwei Nomen und zeigt Besitz oder Zugehörigkeit: 어머니의 핸드폰 = das Handy der Mutter. Der Besitzer steht zuerst. Im Gespräch fällt 의 oft weg (우리 엄마 핸드폰).',
    memory: 'Wie das englische ’s: Mutter’s Handy → 어머니의 핸드폰.',
    examples: [
      { ko: '이것은 어머니의 핸드폰이에요.', de: 'Das ist das Handy meiner Mutter.' },
      { ko: '한국의 날씨는 좋아요.', de: 'Das Wetter in Korea ist schön.' },
      { ko: '오늘은 제 생일이에요.', de: 'Heute ist mein Geburtstag.' },
      { ko: '이것은 내 컵이에요.', de: 'Das ist meine Tasse.' },
    ],
    pitfalls: [
      '나의 → 내 (neutral), 저의 → 제 (bescheiden), 너의 → 네.',
      'Reihenfolge: Besitzer zuerst – 친구의 집 = das Haus des Freundes.',
      '의 wird meist wie 에 ausgesprochen, ist aber eine andere Partikel.',
    ],
  },
  {
    id: 'ege', order: 8, forms: '에게 · 한테 · 께', name: '„an / zu jemandem“', short: 'Empfänger: geben, schreiben, gehen zu Personen', color: '#a2845e',
    lessons: [
      { id: 'empfaenger', title: 'Empfänger (에게 / 한테)', rule: '에게/한테 markiert die Person (oder das Tier), die etwas bekommt.' },
      { id: 'honorativ', title: 'Respektvoll: 께', rule: '께 ist die höfliche Form für respektierte Personen wie Eltern oder Lehrer.' },
    ],
    rule: 'Die Partikeln 에게 und 한테 markieren die Person oder das Tier, an die oder zu der sich etwas richtet: jemandem etwas geben, schreiben, sagen – oder zu jemandem gehen. 한테 klingt lockerer und wird gern bei Tieren benutzt. 께 ist die respektvolle Form (z. B. für Eltern, Lehrer).',
    memory: 'Ort → 에, Person → 에게/한테. 친구 집에 가요, aber 친구에게 가요.',
    examples: [
      { ko: '언니에게 메시지를 써요.', de: 'Ich schreibe meiner älteren Schwester eine Nachricht.' },
      { ko: '고양이한테 우유를 줘요.', de: 'Ich gebe der Katze Milch.' },
      { ko: '이 구두는 저에게 너무 작아요.', de: 'Diese Schuhe sind mir zu klein.' },
      { ko: '어머니께 편지를 써요.', de: 'Ich schreibe meiner Mutter (respektvoll) einen Brief.' },
    ],
    pitfalls: [
      'Bei Orten nie 에게: 학교에 가요, nicht „학교에게“.',
      '에게 und 한테 sind meist austauschbar; 께 nur für respektierte Personen.',
    ],
  },
  {
    id: 'e', order: 9, forms: '에', name: 'Ort, Ziel, Zeit', short: 'wo etwas ist, wohin, wann', color: '#5e5ce6',
    lessons: [
      { id: 'ort', title: 'Ort (sein, sich befinden)', rule: 'Mit 있어요/없어요 sagt 에, wo etwas ist.' },
      { id: 'richtung', title: 'Richtung (wohin)', rule: 'Mit 가요/와요 sagt 에, wohin man geht oder kommt.' },
      { id: 'zeit', title: 'Zeitpunkt (wann)', rule: '에 markiert Zeitpunkte – aber nie bei 어제, 오늘, 내일, 모레.' },
      { id: 'gutschlecht', title: 'gut/schlecht für', rule: 'N에 좋아요/나빠요 = gut/schlecht für N.' },
      { id: 'ursache', title: 'Ursache', rule: '에 kann auch eine Ursache angeben: 비에 젖었어요 (nass vom Regen).' },
    ],
    rule: 'Die Partikel 에 hat mehrere Aufgaben: Sie zeigt, wo sich etwas befindet (mit 있다/없다), wohin eine Bewegung geht (mit 가다/오다), wann etwas passiert, wofür etwas gut oder schlecht ist und – seltener – eine Ursache.',
    memory: '에 ist ein Punkt: ein Ort, an dem man IST, ein Ziel, zu dem man GEHT, ein Zeitpunkt, WANN etwas passiert.',
    examples: [
      { ko: '집에 있어요.', de: 'Ich bin zu Hause.' },
      { ko: '친구 집에 가요.', de: 'Ich gehe zum Haus eines Freundes.' },
      { ko: '다음 주 화요일에 만나요.', de: 'Wir treffen uns nächste Woche am Dienstag.' },
      { ko: '인삼은 건강에 좋아요.', de: 'Ginseng ist gut für die Gesundheit.' },
      { ko: '비에 머리가 다 젖었어요.', de: 'Vom Regen sind meine Haare ganz nass geworden.' },
    ],
    pitfalls: [
      'Kein 에 bei 어제, 오늘, 내일, 모레 (und 지금): 내일 만나요.',
      'Handlung an einem Ort → 에서, nicht 에: 학교에서 공부해요.',
      'Zu einer Person → 에게/한테: 친구에게 가요.',
    ],
  },
  {
    id: 'eseo', order: 10, forms: '에서', name: 'Handlungsort, Herkunft', short: 'wo man etwas tut, woher man kommt', color: '#32ade6',
    lessons: [
      { id: 'handlung', title: 'Ort einer Handlung', rule: '에서 sagt, wo man etwas tut: lernen, arbeiten, essen …' },
      { id: 'herkunft', title: 'Herkunft (woher)', rule: '에서 sagt, woher jemand oder etwas kommt.' },
    ],
    rule: 'Die Partikel 에서 zeigt den Ort, an dem eine Handlung stattfindet (lernen, arbeiten, essen, spielen). Außerdem gibt sie die Herkunft oder den Ausgangspunkt an: 독일에서 왔어요 – ich komme aus Deutschland.',
    memory: 'Passiert dort etwas? → 에서. Ist man nur dort? → 에.',
    examples: [
      { ko: '서울에서 일해요.', de: 'Ich arbeite in Seoul.' },
      { ko: '도서관에서 공부해요.', de: 'Ich lerne in der Bibliothek.' },
      { ko: '어느 나라에서 왔어요?', de: 'Aus welchem Land kommst du?' },
      { ko: '독일에서 왔어요.', de: 'Ich komme aus Deutschland.' },
    ],
    pitfalls: [
      'Sein/Befinden (있어요) → 에; Tun (공부해요) → 에서.',
      'Mit 가요/와요 als Ziel steht 에 (학교에 가요); mit 와요 als Herkunft 에서 (독일에서 왔어요).',
    ],
  },
]

export const chapterOf = (id: ParticleId): ParticleChapter => CHAPTERS.find((c) => c.id === id)!

export const LEVEL_NAMES = ['Einsteiger', 'Anfänger', 'Mittel', 'Fortgeschritten', 'Profi'] as const
export type Level = 1 | 2 | 3 | 4 | 5
