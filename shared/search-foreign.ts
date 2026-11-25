/**
 * Այլ լեզուներով որոնում. անգլերեն, ռուսերեն, ֆրանսերեն, իսպաներեն, գերմաներեն, իտալերեն,
 * արաբերեն և պարսկերեն բառերը դառնում են գրադարանի հայերեն բառերը («psalm» → «Սաղմոս»),
 * իսկ ռուսատառ գրված հայերենը՝ լատինատառ («сагмос» → «sagmos»), որ հետո դառնա հայերեն։
 */
const FOREIGN_TERMS: Array<[string[], string]> = [
  [["prayer", "prayers", "pray", "молитва", "молитвы", "молиться", "prière", "prières", "oración", "oraciones", "gebet", "gebete", "preghiera", "preghiere", "صلاة", "دعاء", "نماز", "دعا"], "Աղոթք"],
  [["psalm", "psalms", "psalter", "псалом", "псалмы", "псалтирь", "псалтырь", "psaume", "psaumes", "salmo", "salmos", "psalmen", "salmi", "مزمور", "مزامير"], "Սաղմոս"],
  [["our father", "lord's prayer", "lords prayer", "отче наш", "notre père", "pater noster", "padre nuestro", "vater unser", "padre nostro", "أبانا الذي", "ای پدر ما"], "Հայր մեր"],
  [["gospel", "gospels", "evangel", "евангелие", "évangile", "evangelio", "evangelium", "vangelo", "إنجيل", "انجیل"], "Ավետարան"],
  [["bible", "holy bible", "библия", "biblia", "bibel", "bibbia", "الكتاب المقدس", "کتاب مقدس"], "Աստվածաշունչ"],
  [["question", "questions", "вопрос", "вопросы", "pregunta", "preguntas", "frage", "fragen", "domanda", "domande", "سؤال", "پرسش"], "Հարց"],
  [["lives of saints", "lives of the saints", "жития святых", "житие", "vies des saints", "vidas de santos", "heiligenleben", "vite dei santi"], "Սրբերի վարք"],
  [["saint", "saints", "святой", "святая", "святые", "sainte", "santo", "santa", "santos", "heilige", "heiliger", "قديس", "قديسين", "قدیس"], "Սուրբ"],
  [["jesus", "christ", "jesus christ", "иисус", "христос", "иисус христос", "jésus", "jésus christ", "jesús", "jesucristo", "cristo", "christus", "jesus christus", "gesù", "gesù cristo", "يسوع", "المسيح", "عیسی", "مسیح"], "Հիսուս Քրիստոս"],
  [["god", "бог", "dieu", "dios", "gott", "dio", "الله", "خدا"], "Աստված"],
  [["lord", "господь", "seigneur", "señor", "herr", "signore", "الرب", "خداوند"], "Տեր"],
  [["mary", "virgin mary", "мария", "богородица", "дева мария", "marie", "vierge marie", "maría", "virgen maría", "madonna", "مريم", "العذراء"], "Սուրբ Մարիամ Աստվածածին"],
  [["holy spirit", "святой дух", "saint esprit", "saint-esprit", "espíritu santo", "heiliger geist", "spirito santo", "الروح القدس", "روح القدس"], "Սուրբ Հոգի"],
  [["cross", "holy cross", "крест", "croix", "cruz", "kreuz", "croce", "صليب"], "Սուրբ Խաչ"],
  [["christmas", "nativity", "рождество", "noël", "navidad", "weihnachten", "natale", "الميلاد"], "Սուրբ Ծնունդ"],
  [["easter", "resurrection", "пасха", "воскресение", "pâques", "pascua", "ostern", "pasqua", "الفصح", "القيامة"], "Սուրբ Զատիկ"],
  [["ascension", "вознесение", "ascensión", "himmelfahrt", "ascensione"], "Համբարձում"],
  [["transfiguration", "преображение", "transfiguración", "verklärung", "trasfigurazione"], "Վարդավառ"],
  [["parable", "parables", "притча", "притчи", "parabole", "parábola", "gleichnis", "parabola"], "Առակ"],
  [["daily reading", "daily readings", "readings", "чтение", "чтения", "lectures", "lecturas", "lesungen", "letture"], "Օրվա ընթերցումներ"],
  [["liturgy", "divine liturgy", "mass", "литургия", "обедня", "liturgie", "messe", "misa", "liturgia", "messa", "قداس"], "Պատարագ"],
  [["fast", "fasting", "lent", "пост", "великий пост", "jeûne", "carême", "ayuno", "cuaresma", "fasten", "fastenzeit", "digiuno", "quaresima", "صوم"], "Պահք"],
  [["communion", "eucharist", "причастие", "евхаристия", "comunión", "kommunion", "comunione"], "Հաղորդություն"],
  [["confession", "исповедь", "confesión", "beichte", "confessione"], "Խոստովանություն"],
  [["baptism", "крещение", "baptême", "bautismo", "taufe", "battesimo", "معمودية"], "Մկրտություն"],
  [["church", "церковь", "храм", "église", "iglesia", "kirche", "chiesa", "كنيسة", "کلیسا"], "Եկեղեցի"],
  [["angel", "angels", "ангел", "ангелы", "ange", "anges", "ángel", "engel", "angelo", "ملاك", "فرشته"], "Հրեշտակ"],
  [["apostle", "apostles", "апостол", "апостолы", "apôtre", "apóstol", "apostel", "apostolo"], "Առաքյալ"],
  [["commandment", "commandments", "заповедь", "заповеди", "commandement", "mandamiento", "gebot", "gebote", "comandamento"], "Պատվիրան"],
  [["repentance", "покаяние", "repentance", "arrepentimiento", "buße", "busse", "pentimento", "توبة"], "Ապաշխարություն"],
  [["faith", "вера", "foi", "fe", "glaube", "fede", "إيمان", "ایمان"], "Հավատք"],
  [["love", "любовь", "amour", "amor", "liebe", "amore", "محبة", "عشق"], "Սեր"],
  [["hope", "надежда", "espoir", "esperanza", "hoffnung", "speranza", "رجاء", "امید"], "Հույս"],
  [["forgiveness", "прощение", "pardon", "perdón", "vergebung", "perdono", "مغفرة"], "Ներում"],
  [["gregory the illuminator", "григорий просветитель", "grégoire l'illuminateur", "gregorio el iluminador"], "Սուրբ Գրիգոր Լուսավորիչ"],
  [["narekatsi", "narek", "нарекаци", "нарек"], "Սուրբ Գրիգոր Նարեկացի"],
  [["shnorhali", "шнорали"], "Սուրբ Ներսես Շնորհալի"],
];

/** Փոքրատառ, առանց շեշտերի (é → e, ñ → n, й → и), որ «priere»-ն և «prière»-ն նույնը լինեն։ */
function plain(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ё/gu, "е").replace(/\s+/gu, " ");
}

const ENTRIES = FOREIGN_TERMS.map(([words, armenian]) => [words.map(plain), armenian] as const);
const FOREIGN = new Map(ENTRIES.flatMap(([words, armenian]) => words.map((word) => [word, armenian] as const)));

/** Այլ լեզվի բառերը, որոնք սկսվում են գրածով, որպես հայերեն բառեր։ */
export function foreignSuggestions(typed: string) {
  const value = plain(typed);
  if (Array.from(value).length < 2 || /\p{Script=Armenian}/u.test(value)) return [];
  return [...new Set(ENTRIES.filter(([words]) => words.some((word) => word.startsWith(value))).map(([, armenian]) => armenian))];
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Ռուսատառ գրված հայերեն բառը՝ լատինատառ («сагмос» → «sagmos»)։ Այլ տառերը մնում են։ */
export function cyrillicToLatin(value: string) {
  return Array.from(plain(value), (character) => CYRILLIC_TO_LATIN[character] ?? character).join("");
}

/**
 * Այլ լեզվով որոնումը՝ հայերեն («Prayer» → «Աղոթք», «молит» → «Աղոթք»)։ Ծանոթ բառ չէ, բայց
 * ռուսատառ է՝ դառնում է լատինատառ, որ կարդացվի որպես հայերեն։ Մնացածը մնում է նույնը։
 */
export function translateQuery(query: string) {
  const value = plain(query);
  const exact = FOREIGN.get(value);
  if (exact) return exact;
  // Ծանոթ բառի սկիզբը («молит», «praye»)՝ այդ բառը։
  const started = Array.from(value).length >= 4 ? foreignSuggestions(value) : [];
  if (started.length === 1) return started[0];
  if (/\p{Script=Cyrillic}/u.test(value)) return cyrillicToLatin(value);
  return query;
}
