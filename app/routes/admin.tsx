import { env } from "cloudflare:workers";
import {
  data,
  Form,
  isRouteErrorResponse,
  redirect,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/admin";
import { requireAdmin, requireSameOrigin } from "../auth/admin.server";
import { listActiveCategories } from "../data/categories.server";
import {
  createMaterial,
  listAdminMaterials,
  MaterialWriteError,
} from "../data/materials.server";

type FormValues = {
  title: string;
  categoryId: string;
  telegramUrl: string;
};

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

const emptyFormValues: FormValues = {
  title: "",
  categoryId: "",
  telegramUrl: "",
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
  const title = normalizeTitle(values.title);
  const telegramUrl = normalizeTelegramPostUrl(values.telegramUrl);

  if (!title) {
    errors.title = "Գրիր նյութի վերնագիրը։";
  } else if (title.length > 240) {
    errors.title = "Վերնագիրը չի կարող գերազանցել 240 նիշը։";
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
    },
  };
}

function formErrorResponse(
  errors: FormErrors,
  values: FormValues,
  status: 400 | 409 = 400,
) {
  return data({ errors, values }, { status });
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const [categories, materials] = await Promise.all([
    listActiveCategories(env.DB),
    listAdminMaterials(env.DB),
  ]);

  return {
    admin,
    categories,
    materials,
    wasCreated: new URL(request.url).searchParams.get("created") === "1",
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  requireSameOrigin(request);

  const formData = await request.formData();
  const values: FormValues = {
    title: readText(formData, "title"),
    categoryId: readText(formData, "categoryId"),
    telegramUrl: readText(formData, "telegramUrl"),
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
          {
            telegramUrl: "Այս Telegram հղումն արդեն գրանցված է։",
          },
          values,
          409,
        );
      }

      return formErrorResponse(
        {
          categoryId: "Ընտրված բաժինը հասանելի չէ։",
        },
        values,
      );
    }

    throw error;
  }

  return redirect("/admin?created=1");
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const isLocalDevelopment = loaderData.admin.source === "local-development";
  const values = actionData?.values ?? emptyFormValues;
  const errors = actionData?.errors ?? {};

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="library-kicker">Կառավարման էջ</p>
        <h1>Telegram հղումների ինդեքս</h1>
        <p>
          Այստեղ գրանցվում է արդեն հրապարակված նյութի հասցեն։ Telegram-ի
          հրապարակումը չի պատճենվում և չի փոփոխվում։
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

      <section className="admin-panel" aria-labelledby="add-material-title">
        <div className="admin-panel-heading">
          <p className="admin-panel-kicker">Նոր գրառում</p>
          <h2 id="add-material-title">Ավելացնել Telegram հղում</h2>
        </div>

        <Form method="post" className="admin-form">
          {errors.form ? (
            <p className="field-error" role="alert">
              {errors.form}
            </p>
          ) : null}

          <div className="form-field">
            <label htmlFor="material-title">Վերնագիր</label>
            <input
              id="material-title"
              name="title"
              type="text"
              required
              maxLength={240}
              defaultValue={values.title}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "material-title-error" : undefined}
              placeholder="Օրինակ՝ Առավոտյան աղոթք"
            />
            {errors.title ? (
              <p id="material-title-error" className="field-error">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="material-category">Բաժին</label>
            <select
              id="material-category"
              name="categoryId"
              required
              defaultValue={values.categoryId}
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

          <button className="admin-submit" type="submit" disabled={isSubmitting}>
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
          <span className="admin-count">{loaderData.materials.length}</span>
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

      <a className="admin-back-link" href="/">
        Վերադառնալ գրադարան
      </a>
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

      <a className="admin-back-link" href="/">
        Վերադառնալ գրադարան
      </a>
    </main>
  );
}
