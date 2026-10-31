/** What an admin other than the owner may be allowed to do; the owner may do all of it. */
export const ADMIN_PERMISSIONS = {
  places: "Սրբավայրեր՝ խմբագրել, ցուցադրել/թաքցնել, ընթերցողների առաջարկներ",
  "places-delete": "Սրբավայրեր՝ ջնջել և փոխել սև ցուցակը",
  people: "Օգտատերերի ցանկը և Excel-ը",
  psalms: "Ձայնագրության տողերի ժամանակները նշել (սաղմոսներ, աղոթքներ)",
  glossary: "Բառարան՝ ավելացնել և խմբագրել բառերը",
  copy: "Մշակողի ռեժիմ (տեքստերի պատճենում)",
} as const;
export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;
export const isAdminPermission = (value: unknown): value is AdminPermission => typeof value === "string" && value in ADMIN_PERMISSIONS;

export function parsePermissions(json: string | null | undefined): AdminPermission[] {
  try { const value = JSON.parse(json ?? "[]"); return Array.isArray(value) ? value.filter(isAdminPermission) : []; } catch { return []; }
}
