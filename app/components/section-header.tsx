import {
  ArrowLeft,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { memo } from "react";
import { Form, Link, useNavigation } from "react-router";

import bibleQuestionsImage from "../assets/bible-questions.webp";
import dailyReadingsImage from "../assets/daily-readings.webp";
import gospelTeachingImage from "../assets/gospel-teaching.webp";
import myCornerImage from "../assets/my-corner.webp";
import prayersImage from "../assets/prayers.webp";
import psalmsImage from "../assets/psalms.webp";
import saintsLivesImage from "../assets/saints-lives.webp";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { useSearchSubmit, useSyncedQueryInput } from "../hooks/use-search-submit";
import { SearchSuggestions } from "./search-suggestions";
import { PageTitle } from "./page-layout";
import { focusRing } from "./ui-styles";

import divider2 from "../assets/divider2.webp";
import { ArtImage } from "./art-image";

const CATEGORY_IMAGES: Record<string, string> = {
  category_saints_lives: saintsLivesImage,
  category_gospel_teachings: gospelTeachingImage,
  category_psalms: psalmsImage,
  category_bible_questions: bibleQuestionsImage,
  category_prayers: prayersImage,
  category_daily_readings: dailyReadingsImage,
};

type SectionHeaderProps = {
  backLabel: string;
  backTo: string;
  imageSrc: string;
  query?: string;
  searchAction: string;
  /** A section's search goes to the search page, filtered to the section (titles on the phone first). */
  searchCategoryId?: string;
  searchLabel: string;
  searchPlaceholder: string;
  showSearch?: boolean;
  /** The page finds the search among its own items (scrolls to and highlights them) instead of loading results. */
  onSearch?: (query: string) => void;
  title: string;
  description?: string;
};

export const MY_CORNER_IMAGE = myCornerImage;

export function getCategoryImage(categoryId: string, categoryName?: string | null) {
  const resolved = resolveContentCategoryId(categoryId, categoryName);
  return (resolved && CATEGORY_IMAGES[resolved]) || saintsLivesImage;
}

export const SectionHeader = memo(function SectionHeader({
  backLabel,
  backTo,
  imageSrc,
  query = "",
  searchAction,
  searchCategoryId,
  searchLabel,
  searchPlaceholder,
  showSearch = true,
  onSearch,
  title,
  description,
}: SectionHeaderProps) {
  // A section searches on its own page (/psalms?q=…); the whole library is offered when nothing is found.
  const formAction = searchAction;
  const { validateSubmit, formRef, clearError, submitImmediately, error } =
    useSearchSubmit(resolveContentCategoryId(searchCategoryId, title) === "category_psalms");
  const inputRef = useSyncedQueryInput(query);
  const navigation = useNavigation();
  const isSearching = navigation.location?.pathname === formAction;

  return (
    <header className="mb-[14px] grid gap-[10px] min-[768px]:mb-[18px] min-[768px]:gap-[14px]">
      <div className="flex items-center gap-2">
        <Link
          className={`inline-flex min-h-[32px] w-fit items-center gap-[7px] rounded-[10px] text-[13px] font-bold text-gold-bright no-underline transition-colors hover:text-ink ${focusRing}`}
          to={backTo}
        >
          <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
          {backLabel}
        </Link>

      </div>
      {/*min-[768px]:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)] min-[768px]:gap-[28px]*/}
      <div className="grid items-center gap-[10px] ">
        {/*[190px] min-[960px]:h-full*/}
        <div className="flex min-h-[160px] w-full items-center justify-center min-[390px]:min-h-[180px] min-[768px]:h-full">
          <ArtImage
            className="block h-full w-full object-cover"
            src={imageSrc}
            width={1774}
            height={887}
            fetchPriority="high"
            decoding="async"
            alt=""
          />
        </div>
        {/*min-[768px]:justify-items-start min-[768px]:text-left*/}
        <div className="grid justify-items-center gap-[9px] text-center ">
          <h1 className="m-0 w-full text-[26px] leading-[32px] font-medium tracking-[-0.4px] text-balance text-ink min-[390px]:text-[28px] min-[390px]:leading-[34px] min-[768px]:text-[34px] min-[768px]:leading-[40px] min-[960px]:text-[40px] min-[960px]:leading-[46px]">
            <PageTitle title={title} />
          </h1>
          {/*<BotanicalDivider />*/}
          <img src={divider2} alt="" width={1200} height={126} decoding="async" className='w-full h-[40px] object-contain'/>

          {description ? <p className="m-0 max-w-[620px] text-[13px] leading-[1.65] text-muted min-[768px]:text-[14px]">{description}</p> : null}

          {showSearch ? (
            <Form
              ref={formRef}
              className="relative z-30 flex min-h-[50px] w-full min-w-0 items-center gap-[10px] rounded-[16px] border border-glass-border bg-control px-[12px] text-faint shadow-card"
              action={formAction}
              method="get"
              role="search"
              onSubmit={(event) => {
                validateSubmit(event);
                if (event.defaultPrevented || !onSearch) return;
                event.preventDefault();
                onSearch((inputRef.current?.value ?? "").trim());
              }}
              aria-busy={isSearching || undefined}
            >
              <Search aria-hidden="true" size={19} strokeWidth={1.9} />
              <SearchSuggestions categoryId={searchCategoryId} inputRef={inputRef} onPick={submitImmediately} />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
                type="search"
                name="q"
                ref={inputRef}
                defaultValue={query}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                autoComplete="off"
                maxLength={120}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "section-search-error" : undefined}
                onInput={clearError}
              />
              {query ? (
                <Link
                  className={`grid size-[32px] shrink-0 place-items-center rounded-[10px] text-muted no-underline hover:text-gold-bright ${focusRing}`}
                  to={searchAction}
                  aria-label="Մաքրել որոնումը"
                  title="Մաքրել որոնումը"
                >
                  <X aria-hidden="true" size={17} strokeWidth={2} />
                </Link>
              ) : null}
              <button type="submit" aria-label="Որոնել այս բաժնում" className="grid size-11 shrink-0 place-items-center rounded-xl bg-subtle text-gold-bright"><Search size={19} /></button>
              {isSearching ? (
                <LoaderCircle
                  className="animate-search-spin shrink-0 text-gold"
                  aria-hidden="true"
                  size={18}
                />
              ) : null}
            </Form>
          ) : null}
          {error ? <p id="section-search-error" role="alert" className="m-0 text-sm search-validation-error">{error}</p> : null}
        </div>
      </div>
    </header>
  );
});
