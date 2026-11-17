# Partikel-Trainer: zum Gegenlesen

Stichprobe aus dem eingebauten Satz-Pool (500 Sätze: 10 Partikeln × 5 Stufen × 10 Sätze).
Bitte prüfen: Ist der koreanische Satz natürlich und richtig? Passt die deutsche Übersetzung?
Ist die Partikel eindeutig die einzig richtige, wenn man die Übersetzung liest?

Automatisch geprüft werden schon (Test `src/lib/particles/particles.test.ts`): Form nach Endkonsonant
(이/가, 을/를, 은/는, 과/와), kein 에 nach 어제/오늘/내일/모레/지금, Anzahl je Stufe, keine doppelten Sätze
und dass jede Auswahl-Aufgabe genau eine richtige Option hat.

## 20 Stichproben-Sätze

| # | Partikel | Stufe | Satz | Deutsch |
|---|---|---|---|---|
| 1 | 이 / 가 | 2 | 커피가 뜨거워요. | Der Kaffee ist heiß. |
| 2 | 이 / 가 | 5 | 요즘 일이 많아서 잠을 잘 못 자요. | Weil ich zurzeit viel Arbeit habe, schlafe ich schlecht. |
| 3 | 을 / 를 | 3 | 어제 친구에게 메시지를 보냈어요. | Gestern habe ich einem Freund eine Nachricht geschickt. |
| 4 | 을 / 를 | 4 | 저는 여름이 좋아요. | Mir gefällt der Sommer. (Verwechslung: 좋아요 + 이/가) |
| 5 | 은 / 는 | 1 | 이것은 책이에요. | Das ist ein Buch. |
| 6 | 은 / 는 | 5 | 말하기는 자신 있는데 쓰기는 아직 어려워요. | Beim Sprechen bin ich sicher, aber Schreiben fällt mir noch schwer. |
| 7 | 과 / 와 · 하고 | 2 | 동생하고 같이 영화를 봐요. | Ich sehe mit meinem jüngeren Geschwister einen Film. |
| 8 | 과 / 와 · 하고 | 4 | 냉장고에 우유와 계란이 없어요. | Im Kühlschrank gibt es keine Milch und keine Eier. |
| 9 | 도 | 3 | 저는 한국에 가 봤어요. 일본에도 가 봤어요. | Ich war schon in Korea. In Japan war ich auch schon. |
| 10 | 도 | 5 | 그 일은 가족에게도 말하지 않았어요. | Davon habe ich nicht einmal meiner Familie erzählt. |
| 11 | 만 | 1 | 조금만 기다려요. | Warte nur kurz. |
| 12 | 만 | 4 | 이 가게는 평일에만 문을 열어요. | Dieser Laden öffnet nur werktags. |
| 13 | 의 | 2 | 독일의 맥주는 유명해요. | Deutsches Bier ist berühmt. |
| 14 | 의 | 5 | 제 실수 때문에 팀의 발표가 늦어졌어요. | Wegen meines Fehlers hat sich die Präsentation des Teams verzögert. |
| 15 | 에게 · 한테 · 께 | 3 | 매운 음식은 아이들에게 안 좋아요. | Scharfes Essen ist nicht gut für Kinder. |
| 16 | 에게 · 한테 · 께 | 4 | 강아지한테 물을 주는 걸 잊었어요. | Ich habe vergessen, dem Welpen Wasser zu geben. |
| 17 | 에 | 1 | 회사에 와요. | Ich komme zur Firma. |
| 18 | 에 | 5 | 주말마다 할머니 댁에 가서 청소를 도와드려요. | Jedes Wochenende fahre ich zu meiner Großmutter und helfe ihr beim Putzen. |
| 19 | 에서 | 2 | 우리 오빠는 서울에서 일해요. | Mein älterer Bruder arbeitet in Seoul. |
| 20 | 에서 | 4 | 저는 주말마다 도서관에서 책을 읽어요. | Ich lese jedes Wochenende in der Bibliothek. |

## Erklärungen

Die Erklärungen (Regel, Formregel, Merkhilfe, Beispiele, Stolperfallen je Partikel) stehen in
`src/lib/particles/content.ts` und sind in der App unter **Üben → Partikel → Kapitel → Erklärung** zu sehen.
Sie sind auf Grundlage der Kursunterlagen eigenständig formuliert. Korrigiert gegenüber der Vorlage:
화요일 = Dienstag, 우유 = Milch.

Bewusste Entscheidungen, die man prüfen kann:
- 은/는 wird bei Auswahl-Aufgaben an Subjekt- und Objektstelle **nicht** als falsche Option angeboten,
  weil es dort oft auch grammatisch richtig wäre. Ausnahme: Antworten auf „누가?“ (dann nur 이/가).
- 과/와 und 하고 gelten immer beide als richtig, 에게 und 한테 ebenso. 께 wird nur in der Lektion „Respektvoll“ verlangt.
- Die deutsche Übersetzung legt die Bedeutung fest: 도 nur bei „auch“, 만 nur bei „nur“.

Fehler oder unnatürliche Sätze einfach mit Nummer melden, dann korrigiere ich sie im Pool.
