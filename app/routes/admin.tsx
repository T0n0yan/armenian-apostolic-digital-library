import { env } from "cloudflare:workers";
import { useState } from "react";
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
import { listActiveCategories } from "../data/categories.server";
import {
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
  category_holy_sites_armenia: {
    label: "Սրբավայրի անունը",
    placeholder: "Օրինակ՝ Գեղարդի վանք",
  },
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Կառավարում — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#f6f2e9" },
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
    if (numberValue === null || numberValue > 150) {
      errors.numberValue = "Նշիր Սաղմոսի համարը՝ 1-ից 150։";
    } else if (!/^Սաղմոս\s+\d+/iu.test(title)) {
      title = title ? `Սաղմոս ${numberValue} — ${title}` : `Սաղմոս ${numberValue}`;
    }
  }

  if (isDailyReading) {
    if (!dateValue || Number.isNaN(new Date(`${dateValue}T00:00:00Z`).getTime())) {
      errors.dateValue = "Ընտրիր օրվա ընթերցման ամսաթիվը։";
    }
    if (!title && dateValue) {
      title = new Intl.DateTimeFormat("hy-AM", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${dateValue}T00:00:00Z`));
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
  if (!value) return "անհայտ";
  return new Intl.DateTimeFormat("hy-AM", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const [categories, materials, materialCount, manualConstraints] = await Promise.all([
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
  await requireAdmin(request);
  requireSameOrigin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

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
  const isSubmitting = navigation.state === "submitting";
  const isImportSubmitting = importFetcher.state !== "idle";
  const isLocalDevelopment = loaderData.admin.source === "local-development";
  const manualActionData =
    actionData?.kind === "manual-error" ? actionData : undefined;
  const values = manualActionData?.values ?? emptyFormValues;
  const errors = manualActionData?.errors ?? {};
  const importData = importFetcher.data;
  const [selectedCategoryId, setSelectedCategoryId] = useState(values.categoryId);
  const [selectedDateValue, setSelectedDateValue] = useState(values.dateValue);
  const [selectedTitleValue, setSelectedTitleValue] = useState(values.title);
  const usedDailyDates = new Set(loaderData.manualConstraints.usedDailyDates);
  const usedTitles = new Set(
    loaderData.manualConstraints.usedTitlesByCategory[selectedCategoryId] ?? [],
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
    <main className="admin-page">
      <header className="admin-header">
        <Link className="admin-menu-link" to="/">
          ← Գլխավոր մենյու
        </Link>
        <p className="library-kicker">Կառավարման էջ</p>
        <h1>Telegram բովանդակության ինդեքս</h1>
        <p>
          JSON export-ը համեմատվում է արդեն պահված տվյալների հետ։ Telegram-ի
          հրապարակումները չեն փոփոխվում, իսկ media ֆայլերը չեն ներբեռնվում։
        </p>
      </header>

      <section className="admin-status" aria-labelledby="admin-status-title">
        <span className="admin-status-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2 id="admin-status-title">Մուտքը հաստատված է</h2>
          <p>
            {isLocalDevelopment
              ? "Local development ռեժիմ"
              : `Cloudflare Access · ${loaderData.admin.email}`}
          </p>
        </div>
      </section>

      {loaderData.wasCreated ? (
        <p className="admin-notice" role="status">
          Հղումը պահպանված է և ավելացված է ինդեքսում։
        </p>
      ) : null}

      <section className="admin-panel" aria-labelledby="telegram-import-title">
        <div className="admin-panel-heading">
          <p className="admin-panel-kicker">Հիմնական ճանապարհ</p>
          <h2 id="telegram-import-title">Ներմուծել Telegram JSON</h2>
          <p className="admin-panel-description">
            Կարող ես կրկին ներմուծել ամբողջ կամ ամսական export։ Նույն message
            ID-ն երկրորդ անգամ չի ստեղծվի, իսկ փոփոխված նյութը կթարմացվի։
          </p>
        </div>

        <importFetcher.Form
          method="post"
          encType="multipart/form-data"
          className="admin-form"
        >
          <div className="form-field">
            <label htmlFor="telegram-export">Telegram result.json</label>
            <input
              id="telegram-export"
              name="telegramExport"
              type="file"
              accept="application/json,.json"
              required
            />
            <p className="field-hint">
              Նկարները, աուդիոները և վիդեոները ներբեռնելու կարիք չկա։
            </p>
          </div>

          <button
            className="admin-submit"
            type="submit"
            name="intent"
            value="telegram-preview"
            disabled={isImportSubmitting}
          >
            {isImportSubmitting ? "Ստուգվում է…" : "Ստուգել ֆայլը"}
          </button>

          {importData?.kind === "telegram-error" ? (
            <p className="field-error" role="alert">
              {importData.message}
            </p>
          ) : null}

          {importData?.kind === "telegram-preview" ||
          importData?.kind === "telegram-imported" ? (
            <div className="import-result" aria-live="polite">
              <div className="import-result-heading">
                <div>
                  <p className="admin-panel-kicker">
                    {importData.kind === "telegram-imported"
                      ? "Ներմուծումն ավարտված է"
                      : "Ստուգման արդյունք"}
                  </p>
                  <h3>{importData.preview.chatTitle}</h3>
                </div>
                <span className="import-result-file">
                  {importData.preview.fileName}
                </span>
              </div>

              <dl className="import-stats">
                <div className="import-stat import-stat-new">
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

              <div className="import-meta">
                <span>
                  Ժամանակահատված՝ {formatImportDate(importData.preview.dateFrom)} —{" "}
                  {formatImportDate(importData.preview.dateTo)}
                </span>
                <span>
                  Տվյալների մոտավոր ծավալը՝{" "}
                  {formatBytes(importData.preview.estimatedBytes)}
                </span>
              </div>

              <ul className="import-topics-list">
                {importData.preview.topics.map((topic) => (
                  <li key={topic.topicId}>
                    <span>{topic.title}</span>
                    <strong>{topic.messageCount}</strong>
                  </li>
                ))}
              </ul>

              {importData.preview.warnings.map((warning) => (
                <p className="import-warning" key={warning}>
                  {warning}
                </p>
              ))}

              {importData.kind === "telegram-preview" &&
              (importData.preview.addedCount > 0 ||
                importData.preview.updatedCount > 0) ? (
                <button
                  className="admin-submit admin-submit-confirm"
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
                <p className="import-all-current">
                  Բոլոր նյութերն արդեն ինդեքսում կան։
                </p>
              ) : null}
            </div>
          ) : null}
        </importFetcher.Form>
      </section>

      <section className="admin-panel" aria-labelledby="add-material-title">
        <div className="admin-panel-heading">
          <p className="admin-panel-kicker">Պահուստային տարբերակ</p>
          <h2 id="add-material-title">Ձեռքով ավելացնել մեկ հղում</h2>
        </div>

        <Form method="post" className="admin-form">
          <input type="hidden" name="intent" value="manual-create" />
          {errors.form ? (
            <p className="field-error" role="alert">
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
              <p id="material-category-error" className="field-error">
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
                max={150}
                required
                defaultValue={values.numberValue}
                aria-invalid={Boolean(errors.numberValue)}
                aria-describedby={
                  errors.numberValue ? "material-number-error" : undefined
                }
                placeholder={`Օրինակ՝ ${loaderData.manualConstraints.nextPsalmNumber}`}
              />
              {errors.numberValue ? (
                <p id="material-number-error" className="field-error">
                  {errors.numberValue}
                </p>
              ) : null}
              {!errors.numberValue ? (
                <p className="field-hint">
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
                <p id="material-date-error" className="field-error">
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
                <p id="material-title-error" className="field-error">
                  {errors.title ?? "Այս բաժնում նույն վերնագրով նյութ արդեն կա։"}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="adaptive-form-prompt">
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
                <p id="material-content-error" className="field-error">
                  {errors.contentText}
                </p>
              ) : (
                <p id="material-content-hint" className="field-hint">
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
              <p id="material-telegram-url-error" className="field-error">
                {errors.telegramUrl}
              </p>
            ) : (
              <p className="field-hint">Միայն արդեն հրապարակված նյութի հղումը։</p>
            )}
          </div>

          <button
            className="admin-submit"
            type="submit"
            disabled={isSubmitting || hasDuplicateDate || hasDuplicateTitle}
          >
            {isSubmitting ? "Պահպանվում է…" : "Պահպանել հղումը"}
          </button>
        </Form>
      </section>

      <section className="admin-panel" aria-labelledby="materials-title">
        <div className="admin-panel-heading admin-panel-heading-row">
          <div>
            <p className="admin-panel-kicker">Ինդեքս</p>
            <h2 id="materials-title">Գրանցված հղումներ</h2>
          </div>
          <span className="admin-count">{loaderData.materialCount}</span>
        </div>

        {loaderData.materials.length === 0 ? (
          <p className="admin-empty">Դեռ որևէ հղում գրանցված չէ։</p>
        ) : (
          <ol className="admin-materials-list">
            {loaderData.materials.map((material) => (
              <li key={material.id} className="admin-material-card">
                <div>
                  <p className="admin-material-category">{material.categoryName}</p>
                  <h3>{material.title}</h3>
                </div>
                <a
                  href={material.telegramUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Բացել Telegram-ում
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isForbidden = isRouteErrorResponse(error) && error.status === 403;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="library-kicker">Կառավարման էջ</p>
        <h1>{isForbidden ? "Մուտքը փակ է" : "Սխալ"}</h1>
        <p>
          {isForbidden
            ? "Այս էջը հասանելի է միայն հաստատված ադմինիստրատորին։"
            : "Կառավարման էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
        </p>
      </header>

      <Link className="admin-back-link" to="/">
        Վերադառնալ գրադարան
      </Link>
    </main>
  );
}
