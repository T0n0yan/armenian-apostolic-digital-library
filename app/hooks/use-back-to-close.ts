import { useEffect, useRef } from "react";

const MARK = "__closeOnBack";
/** Բաց պատուհանի փակելու ֆունկցիան, երբ պատմության վերջին քայլը մերն է։ */
let openClose: (() => void) | null = null;
/** Կոճակով փակելիս մեր քայլը հանում ենք history.back()-ով. այդ popstate-ը ոչ ոքի չի հասնում։ */
let swallowNext = false;
let installed = false;

/**
 * Գրանցվում է կայքի մեկնարկին (entry.client.tsx), React Router-ից առաջ. window-ի վրա լսիչները աշխատում են
 * գրանցման հերթով, և միայն այդպես կարող ենք կանգնեցնել «հետ»-ը, որ Router-ը էջի տվյալները իզուր նորից չբեռնի։
 */
export function installBackGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", (event) => {
    if (swallowNext) {
      swallowNext = false;
      event.stopImmediatePropagation();
      return;
    }
    if (!openClose || window.history.state?.[MARK]) return;
    // «Հետ» բաց պատուհանի ժամանակ. հանվեց մեր քայլը, հասցեն նույնն է՝ միայն փակում ենք պատուհանը։
    event.stopImmediatePropagation();
    const close = openClose;
    openClose = null;
    close();
  });
}

/**
 * Լրիվ էկրանի պատուհան (օր.՝ «Կիսվել նկարով»). հեռախոսի «հետ»-ը (կոճակ կամ սահեցում) նախ փակում է այն,
 * ոչ թե էջը։ Բացվելիս պատմության մեջ ավելանում է նույն հասցեով քայլ. «հետ»-ը այն հանում է և փակում
 * պատուհանը, իսկ «Փակել» կոճակով փակելիս այդ քայլը հանվում է աննկատ։
 */
export function useBackToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    installBackGuard();
    const close = () => closeRef.current();
    window.history.pushState({ ...(window.history.state ?? {}), [MARK]: true }, "");
    openClose = close;
    return () => {
      // Փակվեց «հետ»-ով՝ քայլն արդեն հանված է։ Այլապես (կոճակ, էջի փոխում) հանում ենք մեր քայլը, եթե դեռ վերջինն է։
      if (openClose !== close) return;
      openClose = null;
      if (window.history.state?.[MARK]) {
        swallowNext = true;
        window.history.back();
      }
    };
  }, []);
}
