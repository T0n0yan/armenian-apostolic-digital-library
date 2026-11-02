/**
 * «Դատարկ console». բացողը տեսնում է դատարկություն, իսկ ինչ գրում է՝ անհետանում է (պարբերական
 * մաքրում)։ Սա կատակ/խոչընդոտ է, ոչ իսկական պաշտպանություն (JS անջատելով շրջանցվում է)։
 * Լոկալ dev-ում չի աշխատում, որ մենք կարողանանք debug անել։
 */
export function printSignature() {
  if (typeof window === "undefined") return;
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;
  const blank = "\n".repeat(80);
  const wipe = () => {
    try {
      console.clear();
      // Շատ դատարկ տող, որ ցանկացած գրվածք դուրս հրվի վերև և աչքից կորչի։
      console.log(blank);
    } catch { /* console չկա */ }
  };
  wipe();
  // Ամեն վայրկյան կես՝ մաքրում. գրածդ չի մնում, «ինչու ոչինչ չի երևում» էֆեկտ։
  try { setInterval(wipe, 1500); } catch { /* ignore */ }
}
