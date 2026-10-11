import { env } from "cloudflare:workers";
import { ChevronDown } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
  data,
  Form,
  isRouteErrorResponse,
  Link,
  redirect,
  useFetcher,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/admin";
import {
  createAdminNavigationCookie,
  requireAdmin,
  requireSameOrigin,
} from "../auth/admin.server";
import { CategoryIcon } from "../components/category-icon";
import { SiteNav } from "../components/site-nav";
import type { CategorySummary } from "../data/categories.server";
import { listActiveCategories } from "../data/categories.server";
import {
  type AdminMaterial,
  countAdminMaterials,
  createMaterial,
  getManualMaterialConstraints,
  listAdminMaterials,
  MaterialWriteError,
} from "../data/materials.server";
import {
  importTelegramExport,
  previewTelegramExport,
  TelegramImportError,
} from "../data/telegram-import.server";
import {
  configureTelegramWebhook,
  TelegramBotError,
} from "../data/telegram-bot.server";
import { formatArmenianDate } from "../utils/armenian-date";

type FormValues = {
  title: string;
  categoryId: string;
  telegramUrl: string;
  numberValue: string;
  dateValue: string;
  contentText: string;
};

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

const emptyFormValues: FormValues = {
  title: "",
  categoryId: "",
  telegramUrl: "",
  numberValue: "",
  dateValue: "",
  contentText: "",
};

const categoryTitleFields: Record<
  string,
  { label: string; placeholder: string; optional?: boolean }
> = {
  category_psalms: {
    label: "Սաղմոսի խորագիր",
    placeholder: "Օրինակ՝ Առավոտյան աղոթք օգնության համար",
    optional: true,
  },
  category_daily_readings: {
    label: "Օրվա թեման կամ տոնը",
    placeholder: "Օրինակ՝ Սուրբ Գևորգ զորավարի հիշատակության օր",
    optional: true,
  },
  category_bible_questions: {
    label: "Հարց",
    placeholder: "Գրիր հրապարակված հարցը",
  },
  category_gospel_teachings: {
    label: "Ուսուցման թեման",
    placeholder: "Օրինակ՝ Սերմնացանի առակը",
  },
  category_saints_lives: {
    label: "Սրբի անունը կամ նյութի վերնագիրը",
    placeholder: "Օրինակ՝ Սուրբ Սեթ նախահայր",
  },
  category_prayers: {
    label: "Աղոթքի անունը",
    placeholder: "Օրինակ՝ Առավոտյան աղոթք",
  },
};

const IndexOverview = memo(function IndexOverview({
  categories,
  total,
}: {
  categories: CategorySummary[];
  total: number;
}) {
  const largestCategory = categories.reduce(
    (largest, category) => Math.max(largest, category.materialCount),
    1,
  );

  return (
    <section className="mt-3.5 grid gap-3 min-[560px]:grid-cols-[minmax(180px,0.55fr)_minmax(0,1.45fr)]" aria-labelledby="index-title">
      <div className="grid min-h-[158px] content-center rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[22px] shadow-glass min-[560px]:min-h-full">
        <span className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Ինդեքս</span>
        <strong className="mt-2.5 text-[clamp(2.6rem,8vw,4.8rem)] leading-[0.9] font-bold tracking-[-0.06em] text-gold-bright tabular-nums">{total}</strong>
        <span className="mt-2.5 text-[0.8rem] text-muted">գրանցված Telegram հղում</span>
      </div>
      <div className="rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-5 shadow-glass">
        <div className="mb-5">
          <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Բաշխում</p>
          <h2 className="mt-1.5 mb-0 text-[clamp(1.02rem,2vw,1.25rem)] leading-[1.3]" id="index-title">Նյութերն ըստ բաժինների</h2>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 min-[960px]:grid-cols-2 min-[960px]:gap-x-6">
          {categories.map((category) => {
            const percentage = Math.max(
              4,
              Math.round((category.materialCount / largestCategory) * 100),
            );
            return (
              <li className="flex items-center gap-2.5" key={category.id}>
                <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] border border-glass-border bg-[rgb(124_74_143/15%)]" aria-hidden="true">
                  <CategoryIcon
                    categoryId={category.id}
                    size={17}
                    strokeWidth={1.8}
                  />
                </span>
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="flex justify-between gap-2.5 text-[0.74rem] text-muted">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{category.name}</span>
                    <strong className="text-ink tabular-nums">{category.materialCount}</strong>
                  </span>
                  <span
                    className="relative h-[5px] overflow-hidden rounded-full bg-[rgb(255_255_255/6%)]"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--plum),var(--gold))] shadow-[0_0_16px_rgb(217_181_111/24%)]"
                      style={{ width: `${percentage}%` }}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
});

const RecentMaterials = memo(function RecentMaterials({
  materials,
}: {
  materials: AdminMaterial[];
}) {
  if (materials.length === 0) return null;

  return (
    <details className="group mt-3 overflow-hidden rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] shadow-glass">
      <summary className="flex min-h-[70px] cursor-pointer list-none items-center justify-between gap-3.5 px-[18px] py-4 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[rgb(217_181_111/42%)]">
        <span className="grid gap-1">
          <strong className="text-[0.9rem]">Վերջին {materials.length} նյութերը</strong>
          <small className="text-[0.72rem] text-faint">Արագ ստուգման համար</small>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-glass-border text-gold transition-transform duration-[180ms] group-open:rotate-180" aria-hidden="true">
          <ChevronDown size={17} strokeWidth={1.9} />
        </span>
      </summary>
      <ol className="m-0 grid list-none gap-2 px-3.5 pb-3.5">
        {materials.map((material) => (
          <li key={material.id} className="grid gap-2.5 rounded-[14px] border border-[rgb(255_255_255/8%)] bg-subtle p-[13px] min-[560px]:grid-cols-[minmax(0,1fr)_auto] min-[560px]:items-center [&_a]:w-fit [&_a]:text-[0.75rem] [&_a]:font-[720] [&_a]:text-gold-bright [&_a]:underline-offset-3 [&_h3]:mt-1 [&_h3]:mb-0 [&_h3]:text-[0.82rem] [&_h3]:leading-[1.42] [&_h3]:[overflow-wrap:anywhere]">
            <div>
              <p className="m-0 text-[0.68rem] text-faint">{material.categoryName}</p>
              <h3>{material.title}</h3>
            </div>
            <a href={material.telegramUrl} target="_blank" rel="noreferrer">
              Բացել ↗
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
});

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Կառավարում — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#100817" },
  ];
}

function readText(formData: FormData, field: keyof FormValues) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function normalizeTitle(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value: string) {
  return normalizeTitle(value).toLocaleLowerCase("hy-AM");
}

function normalizeTelegramPostUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLocaleLowerCase();
    const isTelegramHost = hostname === "t.me" || hostname === "telegram.me";
    const pathParts = url.pathname.split("/").filter(Boolean);
    const firstPathPart = pathParts[0]?.toLocaleLowerCase() ?? "";
    const reservedPaths = new Set([
      "addstickers",
      "iv",
      "joinchat",
      "proxy",
      "share",
    ]);
    const hasNumericMessageId = /^\d+$/.test(pathParts.at(-1) ?? "");
    const isPrivatePost =
      firstPathPart === "c" &&
      pathParts.length >= 3 &&
      pathParts.slice(1).every((part) => /^\d+$/.test(part));
    const isPublicPost =
      firstPathPart !== "c" &&
      !reservedPaths.has(firstPathPart) &&
      /^[a-zA-Z0-9_]+$/.test(pathParts[0] ?? "") &&
      pathParts.length >= 2 &&
      pathParts.slice(1).every((part) => /^\d+$/.test(part));

    if (
      url.protocol !== "https:" ||
      !isTelegramHost ||
      !hasNumericMessageId ||
      (!isPrivatePost && !isPublicPost) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    const normalizedParts = [firstPathPart, ...pathParts.slice(1)];
    return `https://t.me/${normalizedParts.join("/")}`;
  } catch {
    return null;
  }
}

function validateForm(values: FormValues) {
  const errors: FormErrors = {};
  let title = normalizeTitle(values.title);
  const telegramUrl = normalizeTelegramPostUrl(values.telegramUrl);
  const isPsalm = values.categoryId === "category_psalms";
  const isDailyReading = values.categoryId === "category_daily_readings";
  const isPrayer = values.categoryId === "category_prayers";
  const contentText = values.contentText.normalize("NFC").trim();
  const parsedNumber = Number(values.numberValue);
  const numberValue =
    isPsalm && Number.isInteger(parsedNumber) && parsedNumber > 0
      ? parsedNumber
      : null;
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(values.dateValue)
    ? values.dateValue
    : null;

  if (isPsalm) {
    if (numberValue === null || numberValue > 151) {
      errors.numberValue = "Նշիր Սաղմոսի համարը՝ 1-ից 151։";
    } else if (!/^Սաղմոս\s+\d+/iu.test(title)) {
      title = title ? `Սաղմոս ${numberValue} — ${title}` : `Սաղմոս ${numberValue}`;
    }
  }

  if (isDailyReading) {
    if (!dateValue || Number.isNaN(new Date(`${dateValue}T00:00:00Z`).getTime())) {
      errors.dateValue = "Ընտրիր օրվա ընթերցման ամսաթիվը։";
    }
    if (!title && dateValue) {
      title = formatArmenianDate(dateValue) ?? dateValue;
    }
  }

  if (!title && !isPsalm && !isDailyReading) {
    errors.title = "Գրիր նյութի վերնագիրը։";
  } else if (title.length > 240) {
    errors.title = "Վերնագիրը չի կարող գերազանցել 240 նիշը։";
  }

  if (isPrayer && !contentText) {
    errors.contentText =
      "Տեղադրիր աղոթքի տեքստը, որպեսզի նույն բովանդակությունը երկրորդ անգամ չգրանցվի։";
  }

  if (!values.categoryId) {
    errors.categoryId = "Ընտրիր բաժինը։";
  }

  if (!telegramUrl) {
    errors.telegramUrl = "Տեղադրիր Telegram հրապարակման ճիշտ հղում։";
  }

  return {
    errors,
    normalized: {
      title,
      categoryId: values.categoryId,
      telegramUrl: telegramUrl ?? "",
      numberValue,
      dateValue,
      contentText,
    },
  };
}

function formErrorResponse(
  errors: FormErrors,
  values: FormValues,
  status: 400 | 409 = 400,
) {
  return data({ kind: "manual-error" as const, errors, values }, { status });
}

function telegramImportErrorMessage(error: TelegramImportError) {
  switch (error.code) {
    case "file-too-large":
      return "JSON ֆայլը չափազանց մեծ է։ Այս փուլում առավելագույն չափը 8 MB է։";
    case "invalid-file":
      return "Ընտրիր Telegram-ից արտահանված result.json ֆայլը։";
    case "missing-username":
      return "Չհաջողվեց գտնել խմբի public username-ը։ Առաջին ներմուծման համար export-ը պետք է պարունակի խմբի ամբողջ պատմությունը։";
    case "no-messages":
      return "Այս export-ի մեջ հրապարակումներ չկան։";
    case "invalid-export":
      return "Ֆայլը Telegram-ի վավեր JSON export չէ կամ վնասված է։";
  }
}

function formatImportDate(value: string | null) {
  return formatArmenianDate(value) ?? "անհայտ";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, env.DB);
  const [categories, materials, materialCount, manualConstraints] =
    await Promise.all([
      listActiveCategories(env.DB),
      listAdminMaterials(env.DB),
      countAdminMaterials(env.DB),
      getManualMaterialConstraints(env.DB),
    ]);

  return data(
    {
      admin,
      categories,
      materials,
      materialCount,
      manualConstraints,
      wasCreated: new URL(request.url).searchParams.get("created") === "1",
    },
    { headers: { "Set-Cookie": createAdminNavigationCookie(request) } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request, env.DB);
  requireSameOrigin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "telegram-webhook-configure") {
    try {
      const integration = await configureTelegramWebhook(request);
      return data({
        kind: "telegram-webhook-ready" as const,
        integration,
      });
    } catch (error) {
      return data(
        {
          kind: "telegram-webhook-error" as const,
          message:
            error instanceof TelegramBotError
              ? error.message
              : "Telegram կապը չհաջողվեց կարգավորել։",
        },
        { status: 502 },
      );
    }
  }

  if (intent === "telegram-preview" || intent === "telegram-import") {
    const file = formData.get("telegramExport");

    if (!(file instanceof File)) {
      return data(
        {
          kind: "telegram-error" as const,
          message: "Ընտրիր Telegram-ից արտահանված result.json ֆայլը։",
        },
        { status: 400 },
      );
    }

    try {
      const preview =
        intent === "telegram-preview"
          ? await previewTelegramExport(env.DB, file)
          : await importTelegramExport(env.DB, file);

      return data({
        kind:
          intent === "telegram-preview"
            ? ("telegram-preview" as const)
            : ("telegram-imported" as const),
        preview,
      });
    } catch (error) {
      if (error instanceof TelegramImportError) {
        return data(
          {
            kind: "telegram-error" as const,
            message: telegramImportErrorMessage(error),
          },
          { status: 400 },
        );
      }
      throw error;
    }
  }

  const values: FormValues = {
    title: readText(formData, "title"),
    categoryId: readText(formData, "categoryId"),
    telegramUrl: readText(formData, "telegramUrl"),
    numberValue: readText(formData, "numberValue"),
    dateValue: readText(formData, "dateValue"),
    contentText: readText(formData, "contentText"),
  };
  const { errors, normalized } = validateForm(values);

  if (Object.keys(errors).length > 0) {
    return formErrorResponse(errors, values);
  }

  try {
    await createMaterial(env.DB, normalized);
  } catch (error) {
    if (error instanceof MaterialWriteError) {
      if (error.code === "duplicate-telegram-url") {
        return formErrorResponse(
          { telegramUrl: "Այս Telegram հղումն արդեն գրանցված է։" },
          values,
          409,
        );
      }
      if (
        error.code === "psalm-out-of-sequence" ||
        error.code === "duplicate-psalm-number"
      ) {
        const constraints = await getManualMaterialConstraints(env.DB);
        return formErrorResponse(
          {
            numberValue: `Արդեն գրանցված են մինչև ${constraints.nextPsalmNumber - 1}-րդ Սաղմոսը։ Ընտրիր ${constraints.nextPsalmNumber} կամ ավելի բարձր համար։`,
          },
          values,
          409,
        );
      }
      if (error.code === "duplicate-date") {
        return formErrorResponse(
          { dateValue: "Այս օրվա ընթերցումն արդեն գրանցված է։" },
          values,
          409,
        );
      }
      if (error.code === "duplicate-title") {
        return formErrorResponse(
          { title: "Այս բաժնում նույն վերնագրով նյութ արդեն կա։" },
          values,
          409,
        );
      }
      if (error.code === "duplicate-content") {
        return formErrorResponse(
          { contentText: "Այս աղոթքի բովանդակությունն արդեն գրանցված է։" },
          values,
          409,
        );
      }

      return formErrorResponse(
        { categoryId: "Ընտրված բաժինը հասանելի չէ։" },
        values,
      );
    }

    throw error;
  }

  return redirect("/admin?created=1");
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const importFetcher = useFetcher<typeof action>();
  const botFetcher = useFetcher<typeof action>();
  const isSubmitting = navigation.state === "submitting";
  const isImportSubmitting = importFetcher.state !== "idle";
  const isLocalDevelopment = loaderData.admin.source === "local-development";
  const isTelegramAdmin = loaderData.admin.source === "telegram";
  const manualActionData =
    actionData?.kind === "manual-error" ? actionData : undefined;
  const values = manualActionData?.values ?? emptyFormValues;
  const errors = manualActionData?.errors ?? {};
  const importData = importFetcher.data;
  const botData = botFetcher.data;
  const [selectedCategoryId, setSelectedCategoryId] = useState(values.categoryId);
  const [selectedDateValue, setSelectedDateValue] = useState(values.dateValue);
  const [selectedTitleValue, setSelectedTitleValue] = useState(values.title);
  const usedDailyDates = useMemo(
    () => new Set(loaderData.manualConstraints.usedDailyDates),
    [loaderData.manualConstraints.usedDailyDates],
  );
  const usedTitles = useMemo(
    () =>
      new Set(
        loaderData.manualConstraints.usedTitlesByCategory[selectedCategoryId] ?? [],
      ),
    [loaderData.manualConstraints.usedTitlesByCategory, selectedCategoryId],
  );
  const hasDuplicateDate = Boolean(
    selectedCategoryId === "category_daily_readings" &&
      selectedDateValue &&
      usedDailyDates.has(selectedDateValue),
  );
  const hasDuplicateTitle = Boolean(
    selectedTitleValue &&
      usedTitles.has(normalizeComparableText(selectedTitleValue)),
  );
  const titleField = categoryTitleFields[selectedCategoryId] ?? {
    label: "Վերնագիր",
    placeholder: "Օրինակ՝ Առավոտյան աղոթք",
  };

  return (
    <main className="mx-auto min-h-svh w-[min(100%,1160px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(26px,4vw,42px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Կառավարման էջ</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">Telegram բովանդակության ինդեքս</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          JSON export-ը համեմատվում է արդեն պահված տվյալների հետ։ Telegram-ի
          հրապարակումները չեն փոփոխվում, իսկ media ֆայլերը չեն ներբեռնվում։
        </p>
      </header>

      <section className="flex items-center gap-[13px] rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[15px] shadow-glass [&_h2]:m-0 [&_h2]:text-[0.9rem] [&_p]:mt-[3px] [&_p]:mb-0 [&_p]:text-[0.74rem] [&_p]:text-faint" aria-labelledby="admin-status-title">
        <span className="grid size-10 shrink-0 place-items-center rounded-[13px] border border-[rgb(119_189_145/28%)] bg-[rgb(119_189_145/12%)] font-[850] text-success" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2 id="admin-status-title">Մուտքը հաստատված է</h2>
          <p>
            {isLocalDevelopment
              ? "Local development ռեժիմ"
              : isTelegramAdmin
                ? `Telegram · ${loaderData.admin.email}`
              : `Cloudflare Access · ${loaderData.admin.email}`}
          </p>
        </div>
      </section>

      {loaderData.wasCreated ? (
        <p className="mt-3.5 mb-0 rounded-[15px] border border-[rgb(119_189_145/24%)] bg-[rgb(119_189_145/9%)] px-[15px] py-[13px] text-[0.84rem] font-bold text-success" role="status">
          Հղումը պահպանված է և ավելացված է ինդեքսում։
        </p>
      ) : null}

      <IndexOverview
        categories={loaderData.categories}
        total={loaderData.materialCount}
      />

      <section className="mt-3 rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(18px,3vw,28px)] shadow-glass" aria-labelledby="bot-integration-title">
        <div className="mb-5">
          <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Խմբի ինտեգրում</p>
          <h2 className="mt-1.5 mb-0 text-[clamp(1.02rem,2vw,1.25rem)] leading-[1.3]" id="bot-integration-title">Միացնել Telegram bot-ը</h2>
          <p className="mt-[9px] mb-0 text-[0.82rem] leading-[1.55] text-muted">
            Մեկ անգամ միացրու webhook-ը, հետո խմբում ուղարկիր <code>/library</code>։
            Միայն գրադարանի ադմինի հրամանը կստեղծի ու կպինի բացման կոճակը։
          </p>
        </div>
        <botFetcher.Form method="post">
          <button
            className="min-h-[49px] cursor-pointer rounded-[14px] border border-[rgb(240_211_151/22%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-[17px] py-[11px] font-[780] text-[#fffaf3] shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_28px_rgb(14_3_20/28%)] hover:brightness-[1.08] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            name="intent"
            value="telegram-webhook-configure"
            disabled={botFetcher.state !== "idle"}
          >
            {botFetcher.state !== "idle" ? "Միացվում է…" : "Միացնել bot-ը խմբերին"}
          </button>
        </botFetcher.Form>
        {botData?.kind === "telegram-webhook-ready" ? (
          <p className="mt-3.5 mb-0 rounded-[15px] border border-[rgb(119_189_145/24%)] bg-[rgb(119_189_145/9%)] px-[15px] py-[13px] text-[0.84rem] font-bold text-success" role="status">
            Bot-ը միացված է{botData.integration.username ? `՝ @${botData.integration.username}` : ""}։
            Հիմա խմբում ուղարկիր <code>/library</code>։
          </p>
        ) : null}
        {botData?.kind === "telegram-webhook-error" ? (
          <p className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger" role="alert">{botData.message}</p>
        ) : null}
      </section>

      <RecentMaterials materials={loaderData.materials} />

      <div className="mt-3 grid gap-3 min-[960px]:grid-cols-2 min-[960px]:items-start">
        <section className="rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(18px,3vw,28px)] shadow-glass" aria-labelledby="telegram-import-title">
        <div className="mb-5">
          <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Հիմնական ճանապարհ</p>
          <h2 className="mt-1.5 mb-0 text-[clamp(1.02rem,2vw,1.25rem)] leading-[1.3]" id="telegram-import-title">Ներմուծել Telegram JSON</h2>
          <p className="mt-[9px] mb-0 text-[0.82rem] leading-[1.55] text-muted">
            Կարող ես կրկին ներմուծել ամբողջ կամ ամսական export։ Նույն message
            ID-ն երկրորդ անգամ չի ստեղծվի, իսկ փոփոխված նյութը կթարմացվի։
          </p>
        </div>

        <importFetcher.Form
          method="post"
          encType="multipart/form-data"
          className="grid gap-[18px] [&_.form-field]:grid [&_.form-field]:gap-2 [&_.form-field>label]:text-[0.8rem] [&_.form-field>label]:font-[720] [&_.form-field_input]:min-h-12 [&_.form-field_input]:w-full [&_.form-field_input]:rounded-[14px] [&_.form-field_input]:border [&_.form-field_input]:border-glass-border [&_.form-field_input]:bg-control [&_.form-field_input]:px-[13px] [&_.form-field_input]:py-[11px] [&_.form-field_input]:text-ink [&_.form-field_input]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_input]:outline-none [&_.form-field_input]:transition-[border-color,box-shadow,background] [&_.form-field_input]:duration-[160ms] [&_.form-field_input:focus]:border-[rgb(217_181_111/48%)] [&_.form-field_input:focus]:bg-glass-strong [&_.form-field_input:focus]:shadow-[0_0_0_3px_rgb(217_181_111/10%)] [&_.form-field_input[aria-invalid=true]]:border-[rgb(239_145_136/62%)]"
        >
          <div className="form-field">
            <label htmlFor="telegram-export">Telegram result.json</label>
            <input
              id="telegram-export"
              name="telegramExport"
              type="file"
              accept="application/json,.json"
              required
              className="text-[0.78rem] text-muted file:mr-2.5 file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-[rgb(124_74_143/28%)] file:px-2.5 file:py-[7px] file:text-ink"
            />
            <p className="m-0 text-[0.73rem] leading-[1.5] text-faint">
              Նկարները, աուդիոները և վիդեոները ներբեռնելու կարիք չկա։
            </p>
          </div>

          <button
            className="min-h-[49px] cursor-pointer rounded-[14px] border border-[rgb(240_211_151/22%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-[17px] py-[11px] font-[780] text-[#fffaf3] shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_28px_rgb(14_3_20/28%)] hover:brightness-[1.08] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            name="intent"
            value="telegram-preview"
            disabled={isImportSubmitting}
          >
            {isImportSubmitting ? "Ստուգվում է…" : "Ստուգել ֆայլը"}
          </button>

          {importData?.kind === "telegram-error" ? (
            <p className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger" role="alert">
              {importData.message}
            </p>
          ) : null}

          {importData?.kind === "telegram-preview" ||
          importData?.kind === "telegram-imported" ? (
            <div className="grid gap-4 rounded-2xl border border-[rgb(119_189_145/20%)] bg-[rgb(119_189_145/5%)] p-4" aria-live="polite">
              <div className="grid gap-[7px] min-[560px]:grid-cols-[minmax(0,1fr)_auto] min-[560px]:items-center [&_h3]:m-0 [&_h3]:text-[0.92rem]">
                <div>
                  <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">
                    {importData.kind === "telegram-imported"
                      ? "Ներմուծումն ավարտված է"
                      : "Ստուգման արդյունք"}
                  </p>
                  <h3>{importData.preview.chatTitle}</h3>
                </div>
                <span className="overflow-hidden text-[0.7rem] text-ellipsis whitespace-nowrap text-faint">
                  {importData.preview.fileName}
                </span>
              </div>

              <dl className="m-0 grid grid-cols-2 gap-[7px] min-[560px]:grid-cols-4 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-[3px] [&>div]:rounded-xl [&>div]:border [&>div]:border-[rgb(255_255_255/8%)] [&>div]:bg-subtle [&>div]:p-2.5 [&_dt]:text-[0.68rem] [&_dt]:text-faint [&_dd]:m-0 [&_dd]:text-[1.18rem] [&_dd]:font-[820] [&_dd]:tabular-nums">
                <div className="[&_dd]:text-success">
                  <dt>Նոր</dt>
                  <dd>{importData.preview.addedCount}</dd>
                </div>
                <div>
                  <dt>Փոփոխված</dt>
                  <dd>{importData.preview.updatedCount}</dd>
                </div>
                <div>
                  <dt>Արդեն կար</dt>
                  <dd>{importData.preview.unchangedCount}</dd>
                </div>
                <div>
                  <dt>Բաց թողնված</dt>
                  <dd>
                    {importData.preview.skippedCount +
                      importData.preview.conflictCount +
                      importData.preview.duplicateCount}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-[5px] text-[0.72rem] leading-[1.45] text-muted">
                <span>
                  Ժամանակահատված՝ {formatImportDate(importData.preview.dateFrom)} —{" "}
                  {formatImportDate(importData.preview.dateTo)}
                </span>
                <span>
                  Տվյալների մոտավոր ծավալը՝{" "}
                  {formatBytes(importData.preview.estimatedBytes)}
                </span>
              </div>

              <ul className="m-0 grid list-none gap-[7px] p-0 [&_li]:flex [&_li]:justify-between [&_li]:gap-2.5 [&_li]:border-b [&_li]:border-[rgb(255_255_255/7%)] [&_li]:pb-[7px] [&_li]:text-[0.74rem] [&_li:last-child]:border-0 [&_li:last-child]:pb-0">
                {importData.preview.topics.map((topic) => (
                  <li key={topic.topicId}>
                    <span>{topic.title}</span>
                    <strong>{topic.messageCount}</strong>
                  </li>
                ))}
              </ul>

              {importData.preview.warnings.map((warning) => (
                <p className="m-0 rounded-[11px] bg-[rgb(217_181_111/9%)] p-[11px] text-[0.72rem] leading-[1.45] text-gold-bright" key={warning}>
                  {warning}
                </p>
              ))}

              {importData.kind === "telegram-preview" &&
              (importData.preview.addedCount > 0 ||
                importData.preview.updatedCount > 0) ? (
                <button
                  className="min-h-[49px] cursor-pointer rounded-[14px] border border-[rgb(240_211_151/22%)] bg-[linear-gradient(135deg,#4b8760,#386849)] px-[17px] py-[11px] font-[780] text-[#fffaf3] shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_28px_rgb(14_3_20/28%)] hover:brightness-[1.08] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60"
                  type="submit"
                  name="intent"
                  value="telegram-import"
                  disabled={isImportSubmitting}
                >
                  Ներմուծել նոր ու փոփոխված նյութերը
                </button>
              ) : null}

              {importData.kind === "telegram-preview" &&
              importData.preview.addedCount === 0 &&
              importData.preview.updatedCount === 0 ? (
                <p className="m-0 rounded-[11px] bg-[rgb(119_189_145/9%)] p-[11px] text-[0.72rem] leading-[1.45] font-[650] text-success">
                  Բոլոր նյութերն արդեն ինդեքսում կան։
                </p>
              ) : null}
            </div>
          ) : null}
        </importFetcher.Form>
        </section>

        <section className="rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(18px,3vw,28px)] shadow-glass" aria-labelledby="add-material-title">
        <div className="mb-5">
          <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Պահուստային տարբերակ</p>
          <h2 className="mt-1.5 mb-0 text-[clamp(1.02rem,2vw,1.25rem)] leading-[1.3]" id="add-material-title">Ձեռքով ավելացնել մեկ հղում</h2>
        </div>

        <Form method="post" className="grid gap-[18px] [&_.form-field]:grid [&_.form-field]:gap-2 [&_.form-field>label]:text-[0.8rem] [&_.form-field>label]:font-[720] [&_.form-field_input]:min-h-12 [&_.form-field_input]:w-full [&_.form-field_input]:rounded-[14px] [&_.form-field_input]:border [&_.form-field_input]:border-glass-border [&_.form-field_input]:bg-control [&_.form-field_input]:px-[13px] [&_.form-field_input]:py-[11px] [&_.form-field_input]:text-ink [&_.form-field_input]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_input]:outline-none [&_.form-field_select]:min-h-12 [&_.form-field_select]:w-full [&_.form-field_select]:rounded-[14px] [&_.form-field_select]:border [&_.form-field_select]:border-glass-border [&_.form-field_select]:bg-control [&_.form-field_select]:px-[13px] [&_.form-field_select]:py-[11px] [&_.form-field_select]:pr-[42px] [&_.form-field_select]:text-ink [&_.form-field_select]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_select]:outline-none [&_.form-field_textarea]:w-full [&_.form-field_textarea]:resize-y [&_.form-field_textarea]:rounded-[14px] [&_.form-field_textarea]:border [&_.form-field_textarea]:border-glass-border [&_.form-field_textarea]:bg-control [&_.form-field_textarea]:px-[13px] [&_.form-field_textarea]:py-[11px] [&_.form-field_textarea]:leading-[1.5] [&_.form-field_textarea]:text-ink [&_.form-field_textarea]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_textarea]:outline-none [&_.form-field_:is(input,select,textarea):focus]:border-[rgb(217_181_111/48%)] [&_.form-field_:is(input,select,textarea):focus]:bg-glass-strong [&_.form-field_:is(input,select,textarea):focus]:shadow-[0_0_0_3px_rgb(217_181_111/10%)] [&_.form-field_:is(input,select,textarea)[aria-invalid=true]]:border-[rgb(239_145_136/62%)]">
          <input type="hidden" name="intent" value="manual-create" />
          {errors.form ? (
            <p className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger" role="alert">
              {errors.form}
            </p>
          ) : null}

          <div className="form-field">
            <label htmlFor="material-category">Բաժին</label>
            <select
              id="material-category"
              name="categoryId"
              required
              defaultValue={values.categoryId}
              onChange={(event) => setSelectedCategoryId(event.currentTarget.value)}
              aria-invalid={Boolean(errors.categoryId)}
              aria-describedby={
                errors.categoryId ? "material-category-error" : undefined
              }
            >
              <option value="" disabled>
                Ընտրել բաժինը
              </option>
              {loaderData.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId ? (
              <p id="material-category-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                {errors.categoryId}
              </p>
            ) : null}
          </div>

          {selectedCategoryId === "category_psalms" ? (
            <div className="form-field">
              <label htmlFor="material-number">Սաղմոսի համար</label>
              <input
                id="material-number"
                name="numberValue"
                type="number"
                inputMode="numeric"
                min={loaderData.manualConstraints.nextPsalmNumber}
                max={151}
                required
                defaultValue={values.numberValue}
                aria-invalid={Boolean(errors.numberValue)}
                aria-describedby={
                  errors.numberValue ? "material-number-error" : undefined
                }
                placeholder={`Օրինակ՝ ${loaderData.manualConstraints.nextPsalmNumber}`}
              />
              {errors.numberValue ? (
                <p id="material-number-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                  {errors.numberValue}
                </p>
              ) : null}
              {!errors.numberValue ? (
                <p className="m-0 text-[0.73rem] leading-[1.5] text-faint">
                  Արդեն գրանցված են մինչև {loaderData.manualConstraints.nextPsalmNumber - 1}-րդը։
                  Կարող ես ավելացնել {loaderData.manualConstraints.nextPsalmNumber}-ից սկսած։
                </p>
              ) : null}
            </div>
          ) : null}

          {selectedCategoryId === "category_daily_readings" ? (
            <div className="form-field">
              <label htmlFor="material-date">Ընթերցման օր</label>
              <input
                id="material-date"
                name="dateValue"
                type="date"
                required
                defaultValue={values.dateValue}
                onInput={(event) => setSelectedDateValue(event.currentTarget.value)}
                aria-invalid={Boolean(errors.dateValue) || hasDuplicateDate}
                aria-describedby={
                  errors.dateValue || hasDuplicateDate
                    ? "material-date-error"
                    : undefined
                }
              />
              {errors.dateValue || hasDuplicateDate ? (
                <p id="material-date-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                  {errors.dateValue ?? "Այս օրվա ընթերցումն արդեն գրանցված է։"}
                </p>
              ) : null}
            </div>
          ) : null}

          {selectedCategoryId ? (
            <div className="form-field">
              <label htmlFor="material-title">
                {titleField.label}
                {titleField.optional ? " (ոչ պարտադիր)" : ""}
              </label>
              <input
                id="material-title"
                name="title"
                type="text"
                required={!titleField.optional}
                maxLength={240}
                defaultValue={values.title}
                onInput={(event) => setSelectedTitleValue(event.currentTarget.value)}
                aria-invalid={Boolean(errors.title) || hasDuplicateTitle}
                aria-describedby={
                  errors.title || hasDuplicateTitle
                    ? "material-title-error"
                    : undefined
                }
                placeholder={titleField.placeholder}
              />
              {errors.title || hasDuplicateTitle ? (
                <p id="material-title-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                  {errors.title ?? "Այս բաժնում նույն վերնագրով նյութ արդեն կա։"}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="m-0 rounded-[13px] border border-dashed border-[rgb(255_255_255/12%)] px-3.5 py-[13px] text-[0.73rem] leading-[1.5] text-faint">
              Ընտրիր բաժինը, և անհրաժեշտ դաշտերը կբացվեն այստեղ։
            </p>
          )}

          {selectedCategoryId === "category_prayers" ? (
            <div className="form-field">
              <label htmlFor="material-content">Աղոթքի տեքստը</label>
              <textarea
                id="material-content"
                name="contentText"
                required
                maxLength={100000}
                rows={7}
                defaultValue={values.contentText}
                aria-invalid={Boolean(errors.contentText)}
                aria-describedby={
                  errors.contentText
                    ? "material-content-error"
                    : "material-content-hint"
                }
                placeholder="Տեղադրիր Telegram հրապարակման աղոթքի տեքստը"
              />
              {errors.contentText ? (
                <p id="material-content-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                  {errors.contentText}
                </p>
              ) : (
                <p id="material-content-hint" className="m-0 text-[0.73rem] leading-[1.5] text-faint">
                  Սա rich-text խմբագիր չէ․ տեքստը պետք է միայն որոնման և նույն
                  աղոթքը երկրորդ անգամ չգրանցելու համար։
                </p>
              )}
            </div>
          ) : null}

          <div className="form-field">
            <label htmlFor="material-telegram-url">Telegram հղում</label>
            <input
              id="material-telegram-url"
              name="telegramUrl"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              defaultValue={values.telegramUrl}
              aria-invalid={Boolean(errors.telegramUrl)}
              aria-describedby={
                errors.telegramUrl ? "material-telegram-url-error" : undefined
              }
              placeholder="https://t.me/channel_name/123"
            />
            {errors.telegramUrl ? (
              <p id="material-telegram-url-error" className="m-0 text-[0.73rem] leading-[1.5] font-[650] text-danger">
                {errors.telegramUrl}
              </p>
            ) : (
              <p className="m-0 text-[0.73rem] leading-[1.5] text-faint">Միայն արդեն հրապարակված նյութի հղումը։</p>
            )}
          </div>

          <button
            className="min-h-[49px] cursor-pointer rounded-[14px] border border-[rgb(240_211_151/22%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-[17px] py-[11px] font-[780] text-[#fffaf3] shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_28px_rgb(14_3_20/28%)] hover:brightness-[1.08] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={isSubmitting || hasDuplicateDate || hasDuplicateTitle}
          >
            {isSubmitting ? "Պահպանվում է…" : "Պահպանել հղումը"}
          </button>
        </Form>
        </section>
      </div>

    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isForbidden = isRouteErrorResponse(error) && error.status === 403;

  return (
    <main className="mx-auto min-h-svh w-[min(100%,1160px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]">
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(26px,4vw,42px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Կառավարման էջ</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">{isForbidden ? "Մուտքը փակ է" : "Սխալ"}</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          {isForbidden
            ? "Այս էջը հասանելի է միայն հաստատված ադմինիստրատորին։"
            : "Կառավարման էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
        </p>
      </header>

      <Link className="mt-5 inline-flex w-fit text-[0.75rem] font-[720] text-gold-bright underline-offset-3" to="/">
        Վերադառնալ գրադարան
      </Link>
    </main>
  );
}
