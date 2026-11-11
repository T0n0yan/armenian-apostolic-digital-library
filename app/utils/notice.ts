/**
 * Կարճ ծանուցում էկրանի վերևում (օր.՝ «Չհաջողվեց պահել»)։ Առանց React-ի՝ կանչվում է ցանկացած տեղից,
 * ինքն է անհետանում։ Էկրանի ընթերցիչը կարդում է այն (role="alert")։
 */
export function showNotice(text: string, ms = 4_000) {
  if (typeof document === "undefined") return;
  document.querySelector("[data-site-notice]")?.remove();
  const box = document.createElement("div");
  box.dataset.siteNotice = "";
  box.setAttribute("role", "alert");
  box.textContent = text;
  box.style.cssText = "position:fixed;z-index:120;left:12px;right:12px;top:calc(var(--tg-inset-top,0px) + 12px);margin:0 auto;max-width:440px;"
    + "padding:12px 16px;border-radius:16px;background:var(--page-bg);color:var(--ink);border:1px solid var(--glass-border);"
    + "box-shadow:0 18px 44px rgb(20 8 24 / 34%);font-size:14px;line-height:1.5;text-align:center";
  document.body.appendChild(box);
  window.setTimeout(() => box.remove(), ms);
}
