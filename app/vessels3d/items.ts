// Եկեղեցական սպասք՝ 3D-ով («Խորհրդանիշներ և եկեղեցական առարկաներ» էջում)։
// Անունները և բացատրությունները սևագիր են. քահանան պետք է ստուգի (⚑ Ճշտել)։

export type VesselId =
  | "burvar" | "burvar-gold" | "kshots" | "ashtanak" | "khnkaman"
  | "khachvar-khachelutyun" | "khachvar-astvatsatsin" | "khachvar-narekatsi";

export type Vessel = { id: VesselId; title: string; text: string; thumb: string; block?: string };

export const VESSELS: Vessel[] = [
  { id: "burvar", title: "Բուրվառ", block: "khunk", thumb: "/vessels/thumbs/burvar.webp",
    text: "Խունկ ծխելու անոթ՝ շղթաներով և զանգուլակներով։ Կափարիչը բարձրանում է շղթայով, ներսում վառվում է ածուխը, վրան դրվում է խունկը։" },
  { id: "burvar-gold", title: "Բուրվառ՝ ոսկեգույն", block: "khunk", thumb: "/vessels/thumbs/burvar-gold.webp",
    text: "Դրվագազարդ բուրվառ։ Քահանան կամ սարկավագը խնկարկում է Սեղանը, սրբապատկերները և ժողովրդին։" },
  { id: "kshots", title: "Քշոց", block: "kshots", thumb: "/vessels/thumbs/kshots.webp",
    text: "Կլոր սկավառակ՝ սերովբեի պատկերով և զանգուլակներով, ձողի վրա։ Սարկավագները շարժում են այն Պատարագի կարևոր պահերին։" },
  { id: "ashtanak", title: "Աշտանակ", block: "mom", thumb: "/vessels/thumbs/ashtanak.webp",
    text: "Բարձր մոմակալ, որ դրվում է Սուրբ Սեղանի վրա կամ մոտ։ Մոմի լույսը խորհրդանշում է Քրիստոսի լույսը։" },
  { id: "khnkaman", title: "Խնկաման", block: "khunk", thumb: "/vessels/thumbs/khnkaman.webp",
    text: "Փոքր անոթ՝ ծակոտկեն պատերով, որտեղ խունկ է ծխվում։" },
  { id: "khachvar-khachelutyun", title: "Խաչվառ՝ Խաչելություն", thumb: "/vessels/thumbs/khachvar-khachelutyun.webp",
    text: "Եկեղեցական դրոշ՝ Քրիստոսի Խաչելության պատկերով։ Տանում են թափորների ժամանակ։" },
  { id: "khachvar-astvatsatsin", title: "Խաչվառ՝ Աստվածածին", thumb: "/vessels/thumbs/khachvar-astvatsatsin.webp",
    text: "Եկեղեցական դրոշ՝ Աստվածածնի և Մանուկ Հիսուսի պատկերով։" },
  { id: "khachvar-narekatsi", title: "Խաչվառ՝ Սբ Գրիգոր Նարեկացի", thumb: "/vessels/thumbs/khachvar-narekatsi.webp",
    text: "Եկեղեցական դրոշ՝ Սուրբ Գրիգոր Նարեկացու պատկերով։" },
];
