/**
 * Eingebauter Satz-Pool für den Partikel-Trainer (offline, ohne Key): 50 Sätze je Partikel, 10 je Stufe.
 * Zeile: Stufe|Lektion|Satz mit {Lücken}|Deutsch[|c]
 *   {가} Lücke · {저+가=제가} Sonderform  ({는|가} mit mehreren Lösungen geht nur in KI-Sätzen, hier trennt | die Spalten)
 *   c = Satz macht den Unterschied 이/가 ↔ 은/는 eindeutig (dann darf das jeweils andere als falsche Option erscheinen)
 * Die Formen nach Endkonsonant/Vokal, die Anzahl je Stufe und weitere Regeln prüft particles.test.ts.
 */
import type { ParticleId } from './forms'

export interface PoolSentence {
  id: string
  particle: ParticleId
  lesson: string
  level: 1 | 2 | 3 | 4 | 5
  ko: string
  de: string
  contrast?: boolean
  source: 'pool' | 'ai'
  /** KI-Sätze: Wörter, die (noch) nicht im eigenen Wortschatz sind, mit Übersetzung */
  vocab?: { ko: string; de: string }[]
  /** KI-Sätze: Tipp zur Aufgabe */
  tip?: string
  createdAt?: number
}

const RAW: Record<ParticleId, string> = {
  ga: `
1|basis|친구{가} 와요.|Ein Freund kommt.
1|basis|비{가} 와요.|Es regnet.
1|basis|물{이} 있어요.|Es gibt Wasser.
1|basis|시간{이} 없어요.|Ich habe keine Zeit.
1|basis|고양이{가} 있어요.|Es gibt eine Katze.
1|basis|날씨{가} 좋아요.|Das Wetter ist schön.
1|basis|가방{이} 커요.|Die Tasche ist groß.
1|basis|아기{가} 자요.|Das Baby schläft.
1|sonder|{저+가=제가} 해요.|Ich mache es.
1|basis|돈{이} 없어요.|Ich habe kein Geld.
2|basis|동생{이} 학교에 가요.|Mein jüngeres Geschwister geht zur Schule.
2|basis|커피{가} 뜨거워요.|Der Kaffee ist heiß.
2|basis|책상 위에 책{이} 있어요.|Auf dem Schreibtisch liegt ein Buch.
2|basis|오늘은 바람{이} 많이 불어요.|Heute weht viel Wind.
2|basis|머리{가} 아파요.|Ich habe Kopfschmerzen.
2|basis|이 김치{가} 맛있어요.|Dieses Kimchi ist lecker.
2|basis|방에 침대{가} 없어요.|Im Zimmer gibt es kein Bett.
2|sonder|{나+가=내가} 할게.|Ich mache das. (unter Freunden)
2|basis|선생님{이} 와요.|Die Lehrerin kommt.
2|basis|버스{가} 늦게 와요.|Der Bus kommt spät.
3|basis|어제 친구{가} 우리 집에 왔어요.|Gestern ist ein Freund zu uns nach Hause gekommen.
3|basis|저는 한국 음식{이} 좋아요.|Mir gefällt koreanisches Essen.
3|basis|사과{가} 너무 비쌌어요.|Die Äpfel waren zu teuer.
3|basis|누가 왔어요? – 동생{이} 왔어요.|Wer ist gekommen? – Mein jüngeres Geschwister ist gekommen.|c
3|basis|지갑{이} 없어졌어요.|Mein Portemonnaie ist weg.
3|sonder|누가 창문을 열었어요? – {저+가=제가} 열었어요.|Wer hat das Fenster geöffnet? – Ich war das.
3|basis|영화{가} 정말 재미있었어요.|Der Film war wirklich spannend.
3|basis|한국어 시험{이} 어려웠어요.|Die Koreanischprüfung war schwer.
3|sonder|{너+가=네가} 했어?|Hast du das gemacht? (unter Freunden)
3|basis|길에 사람{이} 많았어요.|Auf der Straße waren viele Leute.
4|basis|저{는} 한국 드라마{가} 좋아요.|Mir gefallen koreanische Serien.
4|basis|형{이} 새 차{를} 샀어요.|Mein älterer Bruder hat ein neues Auto gekauft.
4|basis|날씨{가} 좋아서 공원{에} 갔어요.|Weil das Wetter schön war, bin ich in den Park gegangen.
4|basis|우리 반{에} 독일 학생{이} 세 명 있어요.|In unserer Klasse gibt es drei deutsche Studierende.
4|sonder|{저+가=제가} 내일 전화{를} 할게요.|Ich rufe morgen an.
4|basis|배{가} 고파서 라면{을} 먹었어요.|Weil ich Hunger hatte, habe ich Ramen gegessen.
4|basis|친구{가} 생일 선물{을} 줬어요.|Ein Freund hat mir ein Geburtstagsgeschenk gegeben.
4|basis|이 근처{에} 은행{이} 있어요?|Gibt es hier in der Nähe eine Bank?
4|basis|감기{가} 들어서 학교{에} 못 갔어요.|Weil ich erkältet war, konnte ich nicht zur Schule gehen.
4|basis|누가 이 케이크{를} 만들었어요? – 언니{가} 만들었어요.|Wer hat diesen Kuchen gebacken? – Meine ältere Schwester.|c
5|basis|비{가} 많이 와서 길{이} 미끄러워요.|Weil es stark regnet, ist die Straße rutschig.
5|basis|동생{은} 키{가} 커요.|Mein jüngeres Geschwister ist groß.
5|sonder|이 일은 {저+가=제가} 책임{을} 질게요.|Für diese Sache übernehme ich die Verantwortung.
5|basis|요즘 일{이} 많아서 잠{을} 잘 못 자요.|Weil ich zurzeit viel Arbeit habe, schlafe ich schlecht.
5|basis|한국어 발음{이} 생각보다 어렵지 않았어요.|Die koreanische Aussprache war nicht so schwer wie gedacht.
5|basis|누가 제일 먼저 왔어요? – 민수 씨{가} 제일 먼저 왔어요.|Wer kam zuerst? – Minsu kam als Erster.|c
5|basis|집 앞{에} 새 카페{가} 생겨서 기뻐요.|Ich freue mich, dass vor dem Haus ein neues Café aufgemacht hat.
5|basis|우리 회사{에서} 한국어{를} 하는 사람{이} 저밖에 없어요.|In unserer Firma spricht außer mir niemand Koreanisch.
5|basis|창문{이} 열려 있어서 방{이} 추워요.|Weil das Fenster offen ist, ist das Zimmer kalt.
5|sonder|{나+가=내가} 말했잖아. 그 영화{가} 재미없다고.|Ich hab’s dir doch gesagt: Der Film ist langweilig.
`,
  reul: `
1|basis|물{을} 마셔요.|Ich trinke Wasser.
1|basis|바나나{를} 먹어요.|Ich esse eine Banane.
1|basis|빵{을} 사요.|Ich kaufe Brot.
1|basis|커피{를} 마셔요.|Ich trinke Kaffee.
1|basis|책{을} 읽어요.|Ich lese ein Buch.
1|basis|영화{를} 봐요.|Ich sehe einen Film.
1|basis|음악{을} 들어요.|Ich höre Musik.
1|basis|사과{를} 먹어요.|Ich esse einen Apfel.
1|basis|편지{를} 써요.|Ich schreibe einen Brief.
1|basis|문{을} 열어요.|Ich öffne die Tür.
2|basis|저는 한국어{를} 공부해요.|Ich lerne Koreanisch.
2|basis|동생이 숙제{를} 해요.|Mein jüngeres Geschwister macht Hausaufgaben.
2|basis|아침에 우유{를} 마셔요.|Morgens trinke ich Milch.
2|basis|친구가 사진{을} 찍어요.|Ein Freund macht ein Foto.
2|basis|저는 김치{를} 좋아해요.|Ich mag Kimchi.
2|basis|어머니가 요리{를} 해요.|Meine Mutter kocht.
2|basis|주말에 청소{를} 해요.|Am Wochenende putze ich.
2|basis|가방{을} 찾아요.|Ich suche meine Tasche.
2|basis|저녁에 운동{을} 해요.|Abends mache ich Sport.
2|verwechslung|저는 고양이{를} 좋아해요.|Ich mag Katzen.
3|verwechslung|저는 축구{를} 싫어해요.|Ich mag Fußball nicht.
3|verwechslung|저는 축구{가} 싫어요.|Fußball gefällt mir nicht.
3|basis|어제 친구에게 메시지{를} 보냈어요.|Gestern habe ich einem Freund eine Nachricht geschickt.
3|basis|시장에서 과일{을} 샀어요.|Ich habe auf dem Markt Obst gekauft.
3|basis|누가 제 우산{을} 가져갔어요?|Wer hat meinen Regenschirm mitgenommen?
3|basis|뭐 먹었어요? – 비빔밥{을} 먹었어요.|Was hast du gegessen? – Ich habe Bibimbap gegessen.
3|basis|주말에 한국 드라마{를} 봤어요.|Am Wochenende habe ich eine koreanische Serie gesehen.
3|verwechslung|저는 매운 음식{을} 좋아해요.|Ich mag scharfes Essen.
3|basis|도서관에서 책{을} 빌렸어요.|Ich habe in der Bibliothek ein Buch ausgeliehen.
3|basis|동생이 제 컴퓨터{를} 고장 냈어요.|Mein jüngeres Geschwister hat meinen Computer kaputt gemacht.
4|basis|저{는} 아침마다 신문{을} 읽어요.|Ich lese jeden Morgen Zeitung.
4|verwechslung|언니{는} 고양이{를} 좋아하지만 개{가} 무서워요.|Meine ältere Schwester mag Katzen, aber vor Hunden hat sie Angst.
4|basis|친구{가} 저에게 한국 노래{를} 가르쳐 줬어요.|Ein Freund hat mir ein koreanisches Lied beigebracht.
4|basis|카페{에서} 친구{를} 기다렸어요.|Ich habe im Café auf einen Freund gewartet.
4|basis|형{은} 매일 저녁 기타{를} 쳐요.|Mein älterer Bruder spielt jeden Abend Gitarre.
4|basis|비{가} 와서 택시{를} 탔어요.|Weil es regnete, habe ich ein Taxi genommen.
4|verwechslung|저{는} 여름{이} 좋아요.|Mir gefällt der Sommer.
4|basis|어제 백화점{에서} 구두{를} 샀어요.|Gestern habe ich im Kaufhaus Schuhe gekauft.
4|basis|숙제{를} 다 하고 게임{을} 했어요.|Nachdem ich alle Hausaufgaben gemacht hatte, habe ich gespielt.
4|basis|저{는} 매일 한국어 단어{를} 열 개씩 외워요.|Ich lerne jeden Tag zehn koreanische Wörter auswendig.
5|basis|선생님{이} 학생들{에게} 숙제{를} 내 주셨어요.|Die Lehrerin hat den Schülern Hausaufgaben aufgegeben.
5|verwechslung|저{는} 요리하는 것{을} 좋아하지만 설거지{는} 싫어요.|Ich koche gern, aber Abwaschen mag ich nicht.
5|basis|비밀번호{를} 잊어버려서 새 비밀번호{를} 만들었어요.|Weil ich das Passwort vergessen hatte, habe ich ein neues erstellt.
5|basis|친구{가} 빌려 간 책{을} 아직 안 돌려줬어요.|Mein Freund hat das ausgeliehene Buch noch nicht zurückgegeben.
5|basis|지난주{에} 본 영화{를} 다시 보고 싶어요.|Den Film von letzter Woche möchte ich noch einmal sehen.
5|verwechslung|아이들{이} 단 음식{을} 너무 좋아해서 걱정이에요.|Ich mache mir Sorgen, weil die Kinder Süßes so gern mögen.
5|basis|할머니{께} 드릴 선물{을} 고르고 있어요.|Ich suche ein Geschenk für meine Großmutter aus.
5|basis|저{는} 그 사람 이름{을} 기억 못 해요.|Ich kann mich an den Namen dieser Person nicht erinnern.
5|basis|회의 자료{를} 준비하느라 점심{을} 못 먹었어요.|Weil ich die Besprechungsunterlagen vorbereitet habe, konnte ich nicht zu Mittag essen.
5|basis|어머니{가} 만들어 주신 김치{를} 친구들{과} 나눠 먹었어요.|Das Kimchi, das meine Mutter gemacht hat, habe ich mit Freunden geteilt.
`,
  neun: `
1|thema|저{는} 학생이에요.|Ich bin Student(in).
1|thema|제 이름{은} 레나예요.|Mein Name ist Lena.
1|thema|저{는} 독일 사람이에요.|Ich bin Deutsche(r).
1|thema|이것{은} 책이에요.|Das ist ein Buch.
1|thema|이 사람{은} 제 친구예요.|Diese Person ist mein Freund.
1|thema|오늘{은} 월요일이에요.|Heute ist Montag.
1|thema|저{는} 의사예요.|Ich bin Arzt/Ärztin.
1|thema|여기{는} 서울이에요.|Hier ist Seoul.
1|thema|제 동생{은} 열 살이에요.|Mein jüngeres Geschwister ist zehn Jahre alt.
1|thema|우리 집{은} 커요.|Unser Haus ist groß.
2|kontrast|텔레비전{은} 비싸요. 라디오는 싸요.|Der Fernseher ist teuer. Das Radio ist billig.
2|kontrast|커피는 좋아해요. 그렇지만 차{는} 안 좋아해요.|Kaffee mag ich. Tee aber nicht.
2|thema|우리 어머니{는} 선생님이에요.|Meine Mutter ist Lehrerin.
2|thema|저{는} 대학생이에요.|Ich bin Student(in).
2|thema|한국어{는} 재미있어요.|Koreanisch macht Spaß.
2|thema|제 취미{는} 요리예요.|Mein Hobby ist Kochen.
2|thema|우리 방{은} 작아요.|Unser Zimmer ist klein.
2|thema|토요일{은} 쉬는 날이에요.|Samstag ist mein freier Tag.
2|kontrast|여름은 더워요. 겨울{은} 추워요.|Der Sommer ist heiß. Der Winter (dagegen) ist kalt.
2|thema|제 전화번호{는} 010-1234-5678이에요.|Meine Telefonnummer ist 010-1234-5678.
3|kontrast|오늘 날씨가 좋아요. 그런데 내일{은} 비가 와요.|Heute ist das Wetter schön. Morgen aber regnet es.
3|thema|저{는} 작년에 한국에 갔어요.|Ich war letztes Jahr in Korea.
3|kontrast|형은 키가 커요. 그런데 저{는} 작아요.|Mein älterer Bruder ist groß, ich aber bin klein.
3|thema|이 식당{은} 김치찌개가 유명해요.|Dieses Restaurant ist für sein Kimchi-Jjigae bekannt.
3|kontrast|아침{은} 안 먹었어요. 점심은 먹었어요.|Frühstück habe ich nicht gegessen. Mittagessen schon.
3|thema|어제 본 영화{는} 정말 재미있었어요.|Der Film, den ich gestern gesehen habe, war wirklich gut.
3|kontrast|평일에는 바빠요. 하지만 주말에{는} 한가해요.|Unter der Woche bin ich beschäftigt, am Wochenende aber habe ich Zeit.
3|thema|우리 선생님{은} 한국 사람이에요.|Unsere Lehrerin ist Koreanerin.
3|kontrast|저는 수영{은} 잘해요. 그런데 축구는 못해요.|Schwimmen kann ich gut, Fußball aber nicht.
3|thema|그 가방{은} 얼마였어요?|Wie viel hat die Tasche gekostet?
4|thema|저{는} 매일 아침 커피{를} 마셔요.|Ich trinke jeden Morgen Kaffee.
4|kontrast|언니{는} 영어{를} 잘하지만 저{는} 못해요.|Meine ältere Schwester spricht gut Englisch, ich aber nicht.
4|thema|이 책{은} 친구{가} 빌려줬어요.|Dieses Buch hat mir ein Freund geliehen.
4|thema|서울{은} 여름{에} 아주 더워요.|In Seoul ist es im Sommer sehr heiß.
4|thema|제 방{은} 2층{에} 있어요.|Mein Zimmer ist im zweiten Stock.
4|kontrast|저{는} 고기{를} 안 먹어요. 그렇지만 생선{은} 먹어요.|Ich esse kein Fleisch, Fisch aber schon.
4|thema|우리 학교{는} 역{에서} 가까워요.|Unsere Schule ist nahe am Bahnhof.
4|thema|동생{은} 요즘 피아노{를} 배워요.|Mein jüngeres Geschwister lernt zurzeit Klavier.
4|kontrast|어제{는} 너무 피곤해서 집{에서} 쉬었어요.|Gestern (anders als sonst) war ich sehr müde und habe mich zu Hause ausgeruht.
4|thema|한국 음식{은} 맵지만 저{는} 좋아해요.|Koreanisches Essen ist scharf, aber ich mag es.
5|kontrast|텔레비전{은} 비싸요. 그런데 라디오{는} 싸요.|Der Fernseher ist teuer. Das Radio dagegen ist billig.
5|kontrast|우리 아버지{는} 커피{를} 좋아해요. 그렇지만 차{는} 안 좋아해요.|Mein Vater mag Kaffee, Tee aber nicht.
5|thema|이 문제{는} 생각보다 쉽지 않아서 시간{이} 오래 걸렸어요.|Dieses Problem war schwerer als gedacht und hat lange gedauert.
5|kontrast|비싼 가방{은} 많지만 마음에 드는 가방{은} 없었어요.|Teure Taschen gab es viele, aber keine, die mir gefiel.
5|thema|제가 어제 말한 식당{은} 여기{에서} 걸어서 오 분이에요.|Das Restaurant, von dem ich gestern erzählt habe, ist fünf Minuten zu Fuß von hier.
5|kontrast|한국어 문법{은} 어렵지만 발음{은} 그렇게 어렵지 않아요.|Die koreanische Grammatik ist schwer, die Aussprache aber nicht so sehr.
5|thema|우리 할머니{는} 연세{가} 많으시지만 아주 건강하세요.|Meine Großmutter ist zwar alt, aber sehr gesund.
5|kontrast|형{은} 회사{에} 다니고 저{는} 대학원{에} 다녀요.|Mein älterer Bruder arbeitet in einer Firma, ich gehe zur Graduiertenschule.
5|thema|이번 여행{은} 날씨{가} 좋아서 정말 즐거웠어요.|Diese Reise hat viel Spaß gemacht, weil das Wetter schön war.
5|kontrast|말하기{는} 자신 있는데 쓰기{는} 아직 어려워요.|Beim Sprechen bin ich sicher, aber Schreiben fällt mir noch schwer.
`,
  gwa: `
1|und|빵{과} 우유를 사요.|Ich kaufe Brot und Milch.
1|und|커피{와} 차를 마셔요.|Ich trinke Kaffee und Tee.
1|und|사과{와} 배를 먹어요.|Ich esse Äpfel und Birnen.
1|und|책{과} 펜이 있어요.|Es gibt ein Buch und einen Stift.
1|und|물{과} 주스를 사요.|Ich kaufe Wasser und Saft.
1|mit|친구{와} 놀아요.|Ich spiele mit einem Freund.
1|und|개{와} 고양이가 있어요.|Es gibt einen Hund und eine Katze.
1|und|김치{와} 밥을 먹어요.|Ich esse Kimchi und Reis.
1|mit|엄마{하고} 가요.|Ich gehe mit Mama.
1|und|가방{과} 모자를 사요.|Ich kaufe eine Tasche und eine Mütze.
2|und|우리 어머니는 꽃{과} 빵을 사요.|Meine Mutter kauft Blumen und Brot.
2|und|저는 우유{와} 바나나를 사요.|Ich kaufe Milch und Bananen.
2|mit|저는 어머니{와} 함께 스파게티를 먹어요.|Ich esse mit meiner Mutter zusammen Spaghetti.
2|und|우리 오빠는 골프{와} 테니스를 잘해요.|Mein älterer Bruder spielt gut Golf und Tennis.
2|mit|동생{하고} 같이 영화를 봐요.|Ich sehe mit meinem jüngeren Geschwister einen Film.
2|und|한국어{와} 영어를 공부해요.|Ich lerne Koreanisch und Englisch.
2|und|냉장고에 계란{과} 치즈가 있어요.|Im Kühlschrank sind Eier und Käse.
2|mit|친구{와} 같이 공원에 가요.|Ich gehe mit einem Freund in den Park.
2|und|월요일{과} 수요일에 수업이 있어요.|Montags und mittwochs habe ich Unterricht.
2|und|선생님{과} 학생들이 교실에 있어요.|Die Lehrerin und die Schüler sind im Klassenzimmer.
3|und|마트에서 주스{와} 빵{과} 커피를 샀어요.|Im Supermarkt habe ich Saft, Brot und Kaffee gekauft.
3|mit|어제 남자 친구{와} 데이트했어요.|Gestern hatte ich ein Date mit meinem Freund.
3|und|저는 산{과} 바다를 둘 다 좋아해요.|Ich mag die Berge und das Meer.
3|mit|주말에 가족{과} 함께 여행을 갔어요.|Am Wochenende bin ich mit meiner Familie verreist.
3|und|생일에 꽃{과} 케이크를 받았어요.|Zum Geburtstag habe ich Blumen und einen Kuchen bekommen.
3|mit|누구{와} 같이 살아요?|Mit wem wohnst du zusammen?
3|und|아침에 토스트{와} 커피를 먹었어요.|Zum Frühstück hatte ich Toast und Kaffee.
3|mit|룸메이트{와} 같이 저녁을 만들었어요.|Ich habe mit meiner Mitbewohnerin zusammen Abendessen gemacht.
3|und|부산{과} 제주도에 가 봤어요.|Ich war schon in Busan und auf Jeju.
3|mit|선생님{과} 이야기했어요.|Ich habe mit der Lehrerin gesprochen.
4|und|저{는} 수학{과} 과학{을} 좋아해요.|Ich mag Mathe und Naturwissenschaften.
4|mit|어제 친구{와} 같이 도서관{에서} 공부했어요.|Gestern habe ich mit einem Freund in der Bibliothek gelernt.
4|und|냉장고{에} 우유{와} 계란{이} 없어요.|Im Kühlschrank gibt es keine Milch und keine Eier.
4|mit|동생{하고} 싸워서 기분{이} 안 좋아요.|Ich habe mich mit meinem jüngeren Geschwister gestritten und bin schlecht gelaunt.
4|und|비빔밥{과} 불고기{를} 주문했어요.|Ich habe Bibimbap und Bulgogi bestellt.
4|mit|주말{에} 부모님{과} 함께 등산했어요.|Am Wochenende war ich mit meinen Eltern wandern.
4|und|한국{과} 독일{은} 날씨가 많이 달라요.|Korea und Deutschland haben sehr unterschiedliches Wetter.
4|mit|강아지{와} 같이 산책{을} 해요.|Ich gehe mit meinem Hund spazieren.
4|und|이 가게{는} 옷{과} 신발을 팔아요.|Dieser Laden verkauft Kleidung und Schuhe.
4|mit|어제 친구{와} 전화{를} 오래 했어요.|Gestern habe ich lange mit einem Freund telefoniert.
5|und|회의{에서} 사장님{과} 직원들{이} 새 계획{을} 이야기했어요.|In der Besprechung haben der Chef und die Mitarbeiter über den neuen Plan gesprochen.
5|mit|어릴 때 할아버지{와} 자주 낚시{를} 갔어요.|Als Kind bin ich oft mit meinem Großvater angeln gegangen.
5|und|이번 시험{은} 듣기{와} 읽기{가} 어려웠어요.|Bei dieser Prüfung waren Hören und Lesen schwer.
5|mit|저{는} 한국 친구{와} 언어 교환{을} 하고 있어요.|Ich mache mit einer koreanischen Freundin einen Sprachaustausch.
5|und|가방{에} 지갑{과} 열쇠{가} 들어 있어요.|In der Tasche sind Portemonnaie und Schlüssel.
5|mit|동료{와} 의견{이} 달라서 오래 이야기했어요.|Weil ich mit meinem Kollegen unterschiedlicher Meinung war, haben wir lange gesprochen.
5|und|빨간색{과} 파란색 중{에서} 어느 것{을} 더 좋아해요?|Was magst du lieber, Rot oder Blau?
5|mit|이웃{과} 사이좋게 지내려고 노력해요.|Ich bemühe mich, mit den Nachbarn gut auszukommen.
5|und|사과{와} 배{를} 한 상자씩 샀어요.|Ich habe je eine Kiste Äpfel und Birnen gekauft.
5|mit|팀원들{과} 함께 발표{를} 준비했어요.|Ich habe mit meinem Team die Präsentation vorbereitet.
`,
  do: `
1|auch|저{도} 학생이에요.|Ich bin auch Student(in).
1|auch|차{도} 마셔요.|Ich trinke auch Tee.
1|auch|빵{도} 사요.|Ich kaufe auch Brot.
1|auch|동생{도} 와요.|Mein jüngeres Geschwister kommt auch.
1|auch|고양이{도} 있어요.|Es gibt auch eine Katze.
1|auch|물{도} 주세요.|Bitte auch Wasser.
1|auch|오늘{도} 비가 와요.|Heute regnet es auch.
1|auch|친구{도} 바빠요.|Mein Freund ist auch beschäftigt.
1|auch|김치{도} 맛있어요.|Das Kimchi ist auch lecker.
1|auch|저{도} 좋아요.|Mir passt das auch.
2|auch|저는 커피를 좋아해요. 차{도} 좋아해요.|Ich mag Kaffee. Tee mag ich auch.
2|auch|다니엘은 K-Pop을 좋아해요. 한국 드라마{도} 좋아해요.|Daniel mag K-Pop. Koreanische Serien mag er auch.
2|auch|우리 엄마는 요리를 잘해요. 케이크{도} 잘 만들어요.|Meine Mutter kocht gut. Sie backt auch gut Kuchen.
2|auch|형은 키가 커요. 동생{도} 커요.|Der ältere Bruder ist groß. Der jüngere ist auch groß.
2|auch|월요일에 수업이 있어요. 화요일에{도} 있어요.|Am Montag habe ich Unterricht. Am Dienstag auch.
2|auch|저는 한국어를 배워요. 일본어{도} 배워요.|Ich lerne Koreanisch. Japanisch lerne ich auch.
2|auch|이 가방은 예뻐요. 값{도} 싸요.|Diese Tasche ist hübsch. Der Preis ist auch günstig.
2|auch|집에 개가 있어요. 고양이{도} 있어요.|Zu Hause gibt es einen Hund. Eine Katze gibt es auch.
2|auch|민수 씨는 학생이에요. 저{도} 학생이에요.|Minsu ist Student. Ich bin auch Student(in).
2|auch|오늘은 바빠요. 내일{도} 바빠요.|Heute bin ich beschäftigt. Morgen auch.
3|auch|우리 오빠는 성격이 좋아요. 얼굴{도} 잘생겼어요.|Mein älterer Bruder hat einen guten Charakter. Er sieht auch gut aus.
3|auch|어제 학교에 갔어요. 도서관에{도} 갔어요.|Gestern war ich in der Schule. In der Bibliothek war ich auch.
3|auch|주말에{도} 일했어요.|Ich habe auch am Wochenende gearbeitet.
3|auch|친구한테{도} 메시지를 보냈어요.|Ich habe auch meinem Freund eine Nachricht geschickt.
3|auch|이 식당은 음식이 맛있어요. 분위기{도} 좋아요.|Dieses Restaurant hat leckeres Essen. Die Atmosphäre ist auch gut.
3|auch|저는 한국에 가 봤어요. 일본에{도} 가 봤어요.|Ich war schon in Korea. In Japan war ich auch schon.
3|auch|집에서{도} 한국어를 공부해요.|Ich lerne auch zu Hause Koreanisch.
3|auch|어제 비가 왔어요. 오늘{도} 비가 와요.|Gestern hat es geregnet. Heute regnet es auch.
3|auch|언니는 피아노를 쳐요. 기타{도} 쳐요.|Meine ältere Schwester spielt Klavier. Gitarre spielt sie auch.
3|auch|선생님{도} 그 영화를 보셨어요.|Die Lehrerin hat den Film auch gesehen.
4|auch|저{는} 커피{를} 좋아해요. 그리고 녹차{도} 좋아해요.|Ich mag Kaffee. Und grünen Tee mag ich auch.
4|auch|형{도} 매일 아침 공원{에서} 운동해요.|Mein älterer Bruder macht auch jeden Morgen im Park Sport.
4|auch|서울{에} 가고 싶어요. 부산에{도} 가고 싶어요.|Ich möchte nach Seoul. Nach Busan möchte ich auch.
4|auch|동생{이} 감기에 걸렸어요. 저{도} 걸렸어요.|Mein jüngeres Geschwister ist erkältet. Ich auch.
4|auch|이 카페{는} 커피{도} 맛있고 케이크{도} 맛있어요.|In diesem Café ist der Kaffee lecker und der Kuchen auch.
4|auch|저{는} 아침{도} 안 먹고 점심{도} 안 먹었어요.|Ich habe weder gefrühstückt noch zu Mittag gegessen.
4|auch|친구{가} 한국{에} 가요. 저{도} 같이 가요.|Ein Freund fährt nach Korea. Ich fahre auch mit.
4|auch|이 옷{은} 디자인{도} 예쁘고 값{도} 싸요.|Diese Kleidung hat ein schönes Design und ist auch günstig.
4|auch|저{는} 주말에{도} 회사{에} 가요.|Ich gehe auch am Wochenende in die Firma.
4|auch|언니{는} 한국어{도} 잘하고 일본어{도} 잘해요.|Meine ältere Schwester spricht gut Koreanisch und auch Japanisch.
5|auch|바쁜 날에{도} 운동{은} 꼭 해요.|Auch an stressigen Tagen mache ich auf jeden Fall Sport.
5|auch|그 사람{은} 한 번{도} 늦은 적{이} 없어요.|Diese Person ist kein einziges Mal zu spät gekommen.
5|auch|이번 겨울에는 눈{도} 많이 오고 바람{도} 세게 불었어요.|Diesen Winter hat es viel geschneit, und auch der Wind war stark.
5|auch|할머니께서{도} 그 소식{을} 들으셨어요.|Auch meine Großmutter hat die Nachricht gehört.
5|auch|이 문제{는} 선생님{도} 모르셨어요.|Diese Aufgabe konnte sogar die Lehrerin nicht lösen.
5|auch|그 일{은} 가족에게{도} 말하지 않았어요.|Davon habe ich nicht einmal meiner Familie erzählt.
5|auch|비{가} 오는데 우산{도} 없어서 다 젖었어요.|Es regnete, und weil ich auch keinen Schirm hatte, wurde ich ganz nass.
5|auch|요즘{은} 너무 바빠서 잠잘 시간{도} 없어요.|Zurzeit bin ich so beschäftigt, dass ich nicht einmal Zeit zum Schlafen habe.
5|auch|형{은} 운동{도} 잘하고 공부{도} 잘해요.|Mein älterer Bruder ist gut im Sport und auch im Lernen.
5|auch|저{도} 처음에{는} 한국어{가} 어려웠어요.|Am Anfang fand ich Koreanisch auch schwer.
`,
  man: `
1|nur|물{만} 마셔요.|Ich trinke nur Wasser.
1|nur|너{만} 사랑해.|Ich liebe nur dich.
1|nur|저{만} 와요.|Nur ich komme.
1|nur|커피{만} 주세요.|Bitte nur Kaffee.
1|nur|한 개{만} 사요.|Ich kaufe nur eins.
1|nur|빵{만} 먹어요.|Ich esse nur Brot.
1|nur|조금{만} 기다려요.|Warte nur kurz.
1|nur|동생{만} 있어요.|Nur mein jüngeres Geschwister ist da.
1|nur|주말에{만} 쉬어요.|Ich habe nur am Wochenende frei.
1|nur|한국어{만} 공부해요.|Ich lerne nur Koreanisch.
2|nur|우리 엄마{만} 저를 사랑해요.|Nur meine Mutter liebt mich.
2|nur|저는 저녁에{만} TV를 봐요.|Ich sehe nur abends fern.
2|nur|아침에는 우유{만} 마셔요.|Morgens trinke ich nur Milch.
2|nur|이 가게는 현금{만} 받아요.|Dieser Laden nimmt nur Bargeld.
2|nur|저는 채소{만} 먹어요.|Ich esse nur Gemüse.
2|nur|형은 게임{만} 해요.|Mein älterer Bruder spielt nur Computerspiele.
2|nur|교실에 학생 한 명{만} 있어요.|Im Klassenzimmer ist nur ein Schüler.
2|nur|일요일에{만} 시간이 있어요.|Nur sonntags habe ich Zeit.
2|nur|저는 한국 노래{만} 들어요.|Ich höre nur koreanische Lieder.
2|nur|동생은 고기{만} 좋아해요.|Mein jüngeres Geschwister mag nur Fleisch.
3|nur|어제는 집에서 잠{만} 잤어요.|Gestern habe ich zu Hause nur geschlafen.
3|nur|파티에 친구 두 명{만} 왔어요.|Zur Party kamen nur zwei Freunde.
3|nur|저{만} 그 사실을 몰랐어요.|Nur ich wusste das nicht.
3|nur|돈이 조금{만} 남았어요.|Es ist nur noch wenig Geld übrig.
3|nur|시험 전날에 한 시간{만} 공부했어요.|Am Tag vor der Prüfung habe ich nur eine Stunde gelernt.
3|nur|이 책은 도서관에서{만} 읽을 수 있어요.|Dieses Buch kann man nur in der Bibliothek lesen.
3|nur|그 사람은 자기 생각{만} 해요.|Diese Person denkt nur an sich.
3|nur|주말 내내 드라마{만} 봤어요.|Das ganze Wochenende habe ich nur Serien geschaut.
3|nur|아이스크림을 하나{만} 먹었어요.|Ich habe nur ein Eis gegessen.
3|nur|선생님{만} 정답을 알아요.|Nur die Lehrerin kennt die richtige Antwort.
4|nur|저{는} 커피{만} 마시고 아무것도 안 먹었어요.|Ich habe nur Kaffee getrunken und nichts gegessen.
4|nur|우리 반{에서} 저{만} 독일 사람이에요.|In unserer Klasse bin nur ich Deutsche(r).
4|nur|동생{은} 맛있는 반찬{만} 골라 먹어요.|Mein jüngeres Geschwister sucht sich nur die leckeren Beilagen aus.
4|nur|형{이} 주말에{만} 집{에} 와요.|Mein älterer Bruder kommt nur am Wochenende nach Hause.
4|nur|이 약{은} 하루{에} 한 번{만} 드세요.|Nehmen Sie dieses Medikament nur einmal am Tag.
4|nur|친구{가} 제 말{만} 믿어요.|Mein Freund glaubt nur, was ich sage.
4|nur|저{는} 한국 음식 중{에서} 김치찌개{만} 만들 수 있어요.|Von den koreanischen Gerichten kann ich nur Kimchi-Jjigae kochen.
4|nur|어제{는} 너무 피곤해서 샤워{만} 하고 잤어요.|Gestern war ich so müde, dass ich nur geduscht und dann geschlafen habe.
4|nur|이 가게{는} 평일에{만} 문{을} 열어요.|Dieser Laden öffnet nur werktags.
4|nur|고양이{가} 저{만} 따라다녀요.|Die Katze läuft nur mir hinterher.
5|nur|그 사람{은} 말{만} 하고 행동{은} 안 해요.|Diese Person redet nur und handelt nicht.
5|nur|이번 시험{에서} 한 문제{만} 틀렸어요.|In dieser Prüfung habe ich nur eine Aufgabe falsch gemacht.
5|nur|저{는} 그 사람 얼굴{만} 알고 이름{은} 몰라요.|Ich kenne von dieser Person nur das Gesicht, nicht den Namen.
5|nur|돈{만} 있으면 다 될 거라고 생각하지 마세요.|Denk nicht, dass alles klappt, nur weil man Geld hat.
5|nur|친구들{은} 다 갔고 저{만} 남았어요.|Die Freunde sind alle gegangen, nur ich bin geblieben.
5|nur|이 문제{는} 전문가{만} 해결할 수 있어요.|Dieses Problem kann nur ein Experte lösen.
5|nur|요즘{은} 집에서{만} 일해서 사람{을} 거의 안 만나요.|Zurzeit arbeite ich nur zu Hause und treffe kaum Leute.
5|nur|한국 생활{은} 처음에{만} 힘들었어요.|Das Leben in Korea war nur am Anfang anstrengend.
5|nur|휴가 때 바다{에} 가서 쉬기{만} 했어요.|Im Urlaub bin ich ans Meer gefahren und habe mich nur ausgeruht.
5|nur|그 가수{는} 한국에서{만} 유명해요.|Dieser Sänger ist nur in Korea bekannt.
`,
  ui: `
1|besitz|어머니{의} 가방이에요.|Das ist die Tasche meiner Mutter.
1|besitz|친구{의} 집이에요.|Das ist das Haus eines Freundes.
1|besitz|선생님{의} 책이에요.|Das ist das Buch der Lehrerin.
1|sonder|{저+의=제} 친구예요.|Das ist mein Freund.
1|sonder|{나+의=내} 컵이에요.|Das ist meine Tasse.
1|besitz|동생{의} 방이에요.|Das ist das Zimmer meines jüngeren Geschwisters.
1|besitz|한국{의} 수도는 서울이에요.|Die Hauptstadt Koreas ist Seoul.
1|sonder|{너+의=네} 핸드폰이야?|Ist das dein Handy? (unter Freunden)
1|besitz|아버지{의} 차예요.|Das ist das Auto meines Vaters.
1|besitz|오늘{의} 뉴스예요.|Das sind die heutigen Nachrichten.
2|besitz|이것은 우리 어머니{의} 핸드폰이에요.|Das ist das Handy meiner Mutter.
2|besitz|한국{의} 날씨는 좋아요.|Das Wetter in Korea ist schön.
2|sonder|오늘은 {저+의=제} 생일이에요.|Heute ist mein Geburtstag.
2|besitz|우리 오빠는 BTS{의} 정국을 좋아해요.|Mein älterer Bruder mag Jungkook von BTS.
2|sonder|이 사람은 {저+의=제} 친구예요.|Diese Person ist meine Freundin.
2|sonder|저것은 {너+의=네} 가방이야.|Das da ist deine Tasche. (unter Freunden)
2|besitz|이 노래는 그 가수{의} 첫 노래예요.|Dieses Lied ist das erste Lied dieses Sängers.
2|besitz|독일{의} 맥주는 유명해요.|Deutsches Bier ist berühmt.
2|besitz|이것은 동생{의} 자전거예요.|Das ist das Fahrrad meines jüngeren Geschwisters.
2|besitz|서울{의} 지하철은 편리해요.|Die U-Bahn in Seoul ist praktisch.
3|besitz|어제 친구{의} 생일 파티에 갔어요.|Gestern war ich auf der Geburtstagsparty eines Freundes.
3|sonder|{저+의=제} 꿈은 의사가 되는 거예요.|Mein Traum ist es, Arzt zu werden.
3|besitz|이 회사{의} 사장님을 만났어요.|Ich habe den Chef dieser Firma getroffen.
3|besitz|세종대왕은 한국{의} 왕이었어요.|König Sejong war ein König Koreas.
3|sonder|{나+의=내} 동생은 고등학생이야.|Mein jüngeres Geschwister ist in der Oberstufe. (unter Freunden)
3|besitz|이 책{의} 제목이 뭐예요?|Wie lautet der Titel dieses Buches?
3|besitz|우리 학교{의} 도서관은 아주 커요.|Die Bibliothek unserer Schule ist sehr groß.
3|besitz|그 영화{의} 마지막 장면이 슬펐어요.|Die letzte Szene des Films war traurig.
3|sonder|{너+의=네} 의견은 어때?|Was ist deine Meinung? (unter Freunden)
3|besitz|부모님{의} 결혼기념일을 잊어버렸어요.|Ich habe den Hochzeitstag meiner Eltern vergessen.
4|besitz|이것{은} 할머니{의} 반지예요.|Das ist der Ring meiner Großmutter.
4|sonder|{저+의=제} 동생{은} 서울{에서} 대학교를 다녀요.|Mein jüngeres Geschwister studiert in Seoul.
4|besitz|친구{의} 언니{가} 한국 사람이에요.|Die ältere Schwester meiner Freundin ist Koreanerin.
4|besitz|독일{의} 겨울{은} 길고 추워요.|Der Winter in Deutschland ist lang und kalt.
4|besitz|선생님{의} 설명{을} 잘 들으세요.|Hören Sie der Erklärung der Lehrerin gut zu.
4|sonder|{나+의=내} 방{에} 들어오지 마!|Komm nicht in mein Zimmer! (unter Geschwistern)
4|besitz|이 도시{의} 인구{는} 백만 명이에요.|Diese Stadt hat eine Million Einwohner.
4|besitz|사람들{의} 생각{은} 다 달라요.|Die Menschen denken alle unterschiedlich.
4|sonder|{저+의=제} 취미{는} 사진 찍기예요.|Mein Hobby ist Fotografieren.
4|besitz|우리 회사{의} 점심시간{은} 열두 시부터예요.|Die Mittagspause in unserer Firma beginnt um zwölf.
5|besitz|이 그림{은} 유명한 화가{의} 작품이에요.|Dieses Bild ist ein Werk eines berühmten Malers.
5|sonder|{저+의=제} 실수 때문에 팀{의} 발표{가} 늦어졌어요.|Wegen meines Fehlers hat sich die Präsentation des Teams verzögert.
5|besitz|한국 역사{의} 중요한 사건{을} 공부했어요.|Ich habe wichtige Ereignisse der koreanischen Geschichte gelernt.
5|besitz|이 지역{의} 전통 음식{은} 맵지 않아요.|Das traditionelle Essen dieser Region ist nicht scharf.
5|besitz|환경 문제{는} 우리 모두{의} 책임이에요.|Umweltprobleme liegen in unser aller Verantwortung.
5|sonder|{너+의=네} 말{이} 맞아. 내가 틀렸어.|Du hast recht. Ich lag falsch. (unter Freunden)
5|besitz|학생들{의} 의견{을} 들어 보고 결정할게요.|Ich entscheide, nachdem ich die Meinung der Schüler gehört habe.
5|besitz|그 배우{의} 연기{가} 정말 자연스러웠어요.|Das Schauspiel dieses Schauspielers war wirklich natürlich.
5|besitz|이 소설{의} 주인공{은} 작가 자신이에요.|Die Hauptfigur dieses Romans ist der Autor selbst.
5|besitz|세계{의} 여러 나라{에서} 한국어{를} 배워요.|In vielen Ländern der Welt lernt man Koreanisch.
`,
  ege: `
1|empfaenger|친구{에게} 줘요.|Ich gebe es einem Freund.
1|empfaenger|동생{한테} 말해요.|Ich sage es meinem jüngeren Geschwister.
1|empfaenger|고양이{한테} 우유를 줘요.|Ich gebe der Katze Milch.
1|honorativ|어머니{께} 드려요.|Ich gebe es meiner Mutter (respektvoll).
1|empfaenger|언니{에게} 전화해요.|Ich rufe meine ältere Schwester an.
1|empfaenger|개{한테} 밥을 줘요.|Ich gebe dem Hund Futter.
1|empfaenger|친구{에게} 가요.|Ich gehe zu einem Freund.
1|honorativ|선생님{께} 물어봐요.|Ich frage die Lehrerin (respektvoll).
1|empfaenger|누구{한테} 줘요?|Wem gibst du es?
1|empfaenger|형{에게} 편지를 써요.|Ich schreibe meinem älteren Bruder einen Brief.
2|empfaenger|언니{에게} 메시지를 써요.|Ich schreibe meiner älteren Schwester eine Nachricht.
2|empfaenger|이 구두는 저{에게} 너무 작아요.|Diese Schuhe sind mir zu klein.
2|empfaenger|내 친구{한테} 가요.|Ich gehe zu meiner Freundin.
2|honorativ|우리 어머니{께} 편지를 써요.|Ich schreibe meiner Mutter (respektvoll) einen Brief.
2|empfaenger|동생{에게} 책을 빌려줘요.|Ich leihe meinem jüngeren Geschwister ein Buch.
2|empfaenger|강아지{한테} 장난감을 사 줘요.|Ich kaufe dem Welpen ein Spielzeug.
2|honorativ|할아버지{께} 전화를 드려요.|Ich rufe meinen Großvater an (respektvoll).
2|empfaenger|친구{에게} 선물을 줘요.|Ich gebe einem Freund ein Geschenk.
2|empfaenger|남자 친구{한테} 문자를 보내요.|Ich schicke meinem Freund eine SMS.
2|honorativ|선생님{께} 질문을 해요.|Ich stelle der Lehrerin (respektvoll) eine Frage.
3|empfaenger|어제 친구{에게} 이메일을 보냈어요.|Gestern habe ich einem Freund eine E-Mail geschickt.
3|empfaenger|학교 끝나고 친구{에게} 갔어요.|Nach der Schule bin ich zu einem Freund gegangen.
3|honorativ|부모님{께} 감사 편지를 썼어요.|Ich habe meinen Eltern (respektvoll) einen Dankesbrief geschrieben.
3|empfaenger|고양이{한테} 간식을 너무 많이 줬어요.|Ich habe der Katze zu viele Leckerlis gegeben.
3|empfaenger|누가 동생{에게} 이 이야기를 했어요?|Wer hat meinem jüngeren Geschwister diese Geschichte erzählt?
3|empfaenger|이 옷은 저{한테} 잘 어울려요?|Steht mir diese Kleidung?
3|honorativ|할머니{께} 꽃을 드렸어요.|Ich habe meiner Großmutter (respektvoll) Blumen geschenkt.
3|empfaenger|외국인{에게} 길을 가르쳐 줬어요.|Ich habe einem Ausländer den Weg gezeigt.
3|empfaenger|매운 음식은 아이들{에게} 안 좋아요.|Scharfes Essen ist nicht gut für Kinder.
3|empfaenger|룸메이트{한테} 열쇠를 줬어요.|Ich habe meiner Mitbewohnerin den Schlüssel gegeben.
4|empfaenger|저{는} 매주 동생{에게} 전화{를} 해요.|Ich rufe jede Woche mein jüngeres Geschwister an.
4|honorativ|선생님{께} 숙제{를} 드렸어요.|Ich habe der Lehrerin (respektvoll) die Hausaufgaben gegeben.
4|empfaenger|친구{한테} 생일 카드{를} 보냈어요.|Ich habe einem Freund eine Geburtstagskarte geschickt.
4|empfaenger|이 가방{은} 저{에게} 너무 무거워요.|Diese Tasche ist mir zu schwer.
4|empfaenger|강아지{한테} 물{을} 주는 걸 잊었어요.|Ich habe vergessen, dem Welpen Wasser zu geben.
4|honorativ|아버지{께} 새 넥타이{를} 사 드렸어요.|Ich habe meinem Vater (respektvoll) eine neue Krawatte gekauft.
4|empfaenger|동생{이} 저{한테} 비밀{을} 말해 줬어요.|Mein jüngeres Geschwister hat mir ein Geheimnis erzählt.
4|empfaenger|회사{에} 가기 전{에} 친구{에게} 들렀어요.|Bevor ich zur Firma ging, habe ich kurz bei einem Freund vorbeigeschaut.
4|empfaenger|저{는} 친구 집{에} 가요. 그리고 친구{에게} 선물을 줘요.|Ich gehe zum Haus eines Freundes und gebe ihm ein Geschenk.
4|honorativ|할머니{께} 안부 전화{를} 드렸어요.|Ich habe meine Großmutter (respektvoll) angerufen, um zu fragen, wie es ihr geht.
5|honorativ|교수님{께} 추천서{를} 부탁드렸어요.|Ich habe die Professorin (respektvoll) um ein Empfehlungsschreiben gebeten.
5|empfaenger|이 일{은} 저{에게} 너무 어려워서 도움{이} 필요해요.|Diese Aufgabe ist für mich zu schwer, ich brauche Hilfe.
5|empfaenger|아이{에게} 단 음식{을} 너무 많이 주지 마세요.|Geben Sie dem Kind nicht zu viel Süßes.
5|honorativ|부모님{께} 졸업 소식{을} 전해 드렸어요.|Ich habe meinen Eltern (respektvoll) die Nachricht von meinem Abschluss überbracht.
5|empfaenger|길{에서} 만난 고양이{한테} 먹을 것{을} 줬어요.|Ich habe einer Katze, die ich auf der Straße traf, etwas zu essen gegeben.
5|empfaenger|그 말{은} 친구{에게} 큰 상처{가} 됐어요.|Diese Worte haben meinen Freund sehr verletzt.
5|honorativ|사장님{께} 보고서{를} 드리기 전{에} 한 번 더 확인했어요.|Bevor ich dem Chef (respektvoll) den Bericht gab, habe ich ihn noch einmal geprüft.
5|empfaenger|외국 친구들{에게} 한국 문화{를} 소개하고 싶어요.|Ich möchte ausländischen Freunden die koreanische Kultur vorstellen.
5|empfaenger|동생{한테} 화{를} 내서 미안했어요.|Es tat mir leid, dass ich mein jüngeres Geschwister angeschrien habe.
5|honorativ|할아버지{께} 드릴 선물{을} 아직 못 샀어요.|Das Geschenk für meinen Großvater (respektvoll) habe ich noch nicht gekauft.
`,
  e: `
1|ort|집{에} 있어요.|Ich bin zu Hause.
1|richtung|학교{에} 가요.|Ich gehe zur Schule.
1|ort|방{에} 있어요.|Ich bin im Zimmer.
1|richtung|한국{에} 가요.|Ich fahre nach Korea.
1|zeit|아침{에} 운동해요.|Morgens mache ich Sport.
1|ort|어디{에} 있어요?|Wo bist du?
1|richtung|어디{에} 가요?|Wohin gehst du?
1|zeit|저녁{에} 만나요.|Wir treffen uns am Abend.
1|gutschlecht|건강{에} 좋아요.|Das ist gut für die Gesundheit.
1|richtung|회사{에} 와요.|Ich komme zur Firma.
2|ort|우리 오빠는 지금 베트남{에} 있어요.|Mein älterer Bruder ist gerade in Vietnam.
2|richtung|친구 집{에} 가요.|Ich gehe zum Haus eines Freundes.
2|zeit|우리 다음 주 화요일{에} 만나요.|Wir treffen uns nächste Woche am Dienstag.
2|zeit|나는 점심{에} 운동을 해요.|Ich mache mittags Sport.
2|gutschlecht|인삼은 건강{에} 좋아요.|Ginseng ist gut für die Gesundheit.
2|gutschlecht|담배는 건강{에} 나빠요.|Rauchen ist schlecht für die Gesundheit.
2|ort|책상 위{에} 고양이가 있어요.|Auf dem Schreibtisch ist eine Katze.
2|richtung|주말에 바다{에} 가요.|Am Wochenende fahre ich ans Meer.
2|zeit|아홉 시{에} 수업이 있어요.|Um neun Uhr habe ich Unterricht.
2|ort|화장실이 어디{에} 있어요?|Wo ist die Toilette?
3|ursache|비{에} 머리가 다 젖었어요.|Vom Regen sind meine Haare ganz nass geworden.
3|zeit|작년{에} 한국에 갔어요.|Letztes Jahr bin ich nach Korea gefahren.
3|richtung|어제 병원{에} 갔어요.|Gestern bin ich ins Krankenhaus gegangen.
3|ort|지갑이 가방 안{에} 없었어요.|Das Portemonnaie war nicht in der Tasche.
3|gutschlecht|단 음식은 이{에} 나빠요.|Süßes ist schlecht für die Zähne.
3|zeit|주말{에} 뭐 했어요?|Was hast du am Wochenende gemacht?
3|richtung|방학 때 고향{에} 갔어요.|In den Ferien bin ich in meine Heimatstadt gefahren.
3|ursache|바람{에} 문이 닫혔어요.|Die Tür ist vom Wind zugegangen.
3|ort|어제 저녁에 집{에} 없었어요.|Gestern Abend war ich nicht zu Hause.
3|zeit|2020년{에} 대학교에 입학했어요.|2020 habe ich mit dem Studium angefangen.
4|richtung|저{는} 내일 아침 일찍 공항{에} 가요.|Ich fahre morgen früh zum Flughafen.
4|zeit|토요일{에} 친구{와} 영화를 봤어요.|Am Samstag habe ich mit einem Freund einen Film gesehen.
4|ort|우리 집 근처{에} 큰 공원{이} 있어요.|In der Nähe unseres Hauses gibt es einen großen Park.
4|gutschlecht|야채{는} 몸{에} 좋아요.|Gemüse ist gut für den Körper.
4|richtung|수업{이} 끝나고 도서관{에} 갔어요.|Nach dem Unterricht bin ich in die Bibliothek gegangen.
4|ort|친구{는} 지금 집{에} 없어요. 학교{에} 있어요.|Mein Freund ist gerade nicht zu Hause. Er ist in der Schule.
4|zeit|저{는} 보통 밤 열한 시{에} 자요.|Ich gehe normalerweise um elf Uhr nachts schlafen.
4|ursache|큰 소리{에} 아기{가} 깼어요.|Das Baby ist von dem lauten Geräusch aufgewacht.
4|richtung|저{는} 친구 집{에} 가요. 친구{에게} 줄 선물도 샀어요.|Ich gehe zum Haus eines Freundes. Ein Geschenk für ihn habe ich auch gekauft.
4|gutschlecht|스마트폰{을} 오래 보면 눈{에} 나빠요.|Lange aufs Smartphone zu schauen ist schlecht für die Augen.
5|zeit|다음 달{에} 회사{에서} 중요한 회의{가} 있어요.|Nächsten Monat gibt es in der Firma eine wichtige Besprechung.
5|ursache|갑자기 내린 비{에} 옷{이} 다 젖었어요.|Vom plötzlichen Regen ist meine ganze Kleidung nass geworden.
5|richtung|졸업한 후{에} 독일{에} 돌아갈 거예요.|Nach dem Abschluss werde ich nach Deutschland zurückkehren.
5|ort|제가 찾던 책{이} 책장 맨 위{에} 있었어요.|Das Buch, das ich gesucht hatte, war ganz oben im Regal.
5|gutschlecht|규칙적인 운동{은} 스트레스 해소{에} 좋아요.|Regelmäßiger Sport ist gut gegen Stress.
5|zeit|점심시간{에} 은행{에} 다녀왔어요.|In der Mittagspause war ich kurz bei der Bank.
5|ursache|그 소식{에} 모두{가} 깜짝 놀랐어요.|Über die Nachricht waren alle sehr überrascht.
5|richtung|주말마다 할머니 댁{에} 가서 청소{를} 도와드려요.|Jedes Wochenende fahre ich zu meiner Großmutter und helfe ihr beim Putzen.
5|ort|회의실{에} 아무도 없어서 그냥 나왔어요.|Weil niemand im Besprechungsraum war, bin ich einfach wieder gegangen.
5|gutschlecht|짠 음식{은} 혈압{에} 안 좋으니까 조심하세요.|Salziges Essen ist schlecht für den Blutdruck, also passen Sie auf.
`,
  eseo: `
1|handlung|학교{에서} 공부해요.|Ich lerne in der Schule.
1|handlung|집{에서} 쉬어요.|Ich ruhe mich zu Hause aus.
1|handlung|회사{에서} 일해요.|Ich arbeite in der Firma.
1|herkunft|독일{에서} 왔어요.|Ich komme aus Deutschland.
1|handlung|식당{에서} 먹어요.|Ich esse im Restaurant.
1|handlung|공원{에서} 놀아요.|Ich spiele im Park.
1|herkunft|어디{에서} 왔어요?|Woher kommst du?
1|handlung|카페{에서} 만나요.|Wir treffen uns im Café.
1|handlung|도서관{에서} 읽어요.|Ich lese in der Bibliothek.
1|herkunft|한국{에서} 왔어요.|Ich komme aus Korea.
2|handlung|우리 오빠는 서울{에서} 일해요.|Mein älterer Bruder arbeitet in Seoul.
2|herkunft|어느 나라{에서} 왔어요?|Aus welchem Land kommst du?
2|handlung|저는 집{에서} 한국어를 공부해요.|Ich lerne zu Hause Koreanisch.
2|handlung|마트{에서} 과일을 사요.|Ich kaufe im Supermarkt Obst.
2|handlung|주말에 공원{에서} 자전거를 타요.|Am Wochenende fahre ich im Park Fahrrad.
2|herkunft|이 커피는 브라질{에서} 왔어요.|Dieser Kaffee kommt aus Brasilien.
2|handlung|친구가 카페{에서} 기다려요.|Ein Freund wartet im Café.
2|handlung|저는 부엌{에서} 요리해요.|Ich koche in der Küche.
2|handlung|학생들이 교실{에서} 시험을 봐요.|Die Schüler schreiben im Klassenzimmer eine Prüfung.
2|herkunft|저 사람은 일본{에서} 왔어요.|Diese Person kommt aus Japan.
3|handlung|저는 TU 다름슈타트{에서} 심리학을 공부해요.|Ich studiere Psychologie an der TU Darmstadt.
3|handlung|어제 백화점{에서} 옷을 샀어요.|Gestern habe ich im Kaufhaus Kleidung gekauft.
3|herkunft|이 편지는 한국{에서} 왔어요.|Dieser Brief kam aus Korea.
3|handlung|엘레나 씨의 오빠는 어디{에서} 일해요?|Wo arbeitet Elenas älterer Bruder?
3|handlung|지난주에 친구 집{에서} 파티를 했어요.|Letzte Woche haben wir bei einem Freund eine Party gemacht.
3|herkunft|지금 막 회사{에서} 나왔어요.|Ich bin gerade aus der Firma gekommen.
3|handlung|운동장{에서} 축구를 했어요.|Ich habe auf dem Sportplatz Fußball gespielt.
3|handlung|요즘 어디{에서} 한국어를 배워요?|Wo lernst du zurzeit Koreanisch?
3|herkunft|공항{에서} 호텔까지 택시를 탔어요.|Vom Flughafen bis zum Hotel bin ich Taxi gefahren.
3|handlung|저는 영화관{에서} 팝콘을 먹었어요.|Ich habe im Kino Popcorn gegessen.
4|handlung|저{는} 주말마다 도서관{에서} 책{을} 읽어요.|Ich lese jedes Wochenende in der Bibliothek.
4|herkunft|친구{는} 독일{에서} 왔고 저{는} 한국{에서} 왔어요.|Mein Freund kommt aus Deutschland, ich komme aus Korea.
4|handlung|우리{는} 지금 집{에} 있어요. 거실{에서} TV{를} 봐요.|Wir sind gerade zu Hause. Wir sehen im Wohnzimmer fern.
4|handlung|형{이} 은행{에서} 일한 지 삼 년{이} 됐어요.|Mein älterer Bruder arbeitet seit drei Jahren in einer Bank.
4|handlung|어제 시장{에서} 싼 과일{을} 많이 샀어요.|Gestern habe ich auf dem Markt viel günstiges Obst gekauft.
4|herkunft|서울{에서} 부산까지 세 시간{이} 걸려요.|Von Seoul nach Busan dauert es drei Stunden.
4|handlung|저{는} 학교 식당{에서} 점심{을} 먹어요.|Ich esse in der Mensa zu Mittag.
4|handlung|동생{은} 편의점{에서} 아르바이트{를} 해요.|Mein jüngeres Geschwister jobbt in einem Convenience Store.
4|herkunft|이 사과{는} 대구{에서} 왔어요.|Diese Äpfel kommen aus Daegu.
4|handlung|친구{와} 같이 노래방{에서} 노래했어요.|Ich habe mit einem Freund im Noraebang gesungen.
5|handlung|회의실{에서} 회의{를} 하고 있으니까 조용히 해 주세요.|Im Besprechungsraum läuft eine Besprechung, seien Sie bitte leise.
5|herkunft|이 와인{은} 프랑스{에서} 수입한 거예요.|Dieser Wein wurde aus Frankreich importiert.
5|handlung|저{는} 독일{에서} 태어났지만 한국{에서} 자랐어요.|Ich bin in Deutschland geboren, aber in Korea aufgewachsen.
5|handlung|사람들{이} 많은 곳{에서} 전화{를} 크게 하지 마세요.|Telefonieren Sie nicht laut an Orten mit vielen Menschen.
5|herkunft|집{에서} 회사까지 걸어서 이십 분{이} 걸려요.|Von zu Hause bis zur Firma braucht man zu Fuß zwanzig Minuten.
5|handlung|이 근처{에서} 맛있는 식당{을} 알아요?|Kennst du ein gutes Restaurant hier in der Nähe?
5|handlung|우리 할아버지{는} 평생 시골{에서} 농사{를} 지으셨어요.|Mein Großvater hat sein ganzes Leben auf dem Land Landwirtschaft betrieben.
5|herkunft|방금 학교{에서} 돌아왔어요. 그래서 집{에} 있어요.|Ich bin gerade aus der Schule zurückgekommen, deshalb bin ich zu Hause.
5|handlung|인터넷{에서} 찾은 정보{가} 틀릴 수도 있어요.|Informationen aus dem Internet können auch falsch sein.
5|handlung|세계 여러 나라{에서} 한국 음식{이} 인기{가} 많아요.|In vielen Ländern der Welt ist koreanisches Essen sehr beliebt.
`,
}

function parseRaw(p: ParticleId, raw: string): PoolSentence[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [lvl, lesson, ko, de, flag] = line.split('|')
      return {
        id: `pool-${p}-${i + 1}`,
        particle: p,
        lesson,
        level: Number(lvl) as PoolSentence['level'],
        ko,
        de,
        contrast: flag === 'c' || undefined,
        source: 'pool' as const,
      }
    })
}

export const POOL: PoolSentence[] = (Object.keys(RAW) as ParticleId[]).flatMap((p) => parseRaw(p, RAW[p]))
