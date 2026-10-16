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
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";
import { PageTitle } from "./page-layout";
import { focusRing } from "./ui-styles";

import divider2 from "../assets/divider2.webp";

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
  searchLabel: string;
  searchPlaceholder: string;
  showSearch?: boolean;
  title: string;
  description?: string;
};

export const MY_CORNER_IMAGE = myCornerImage;

export function getCategoryImage(categoryId: string) {
  return CATEGORY_IMAGES[categoryId] ?? saintsLivesImage;
}

function BotanicalDivider() {
  return (
    <svg
      className="h-[18px] w-full max-w-[420px] text-gold"
      viewBox="0 0 420 18"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 9H188" stroke="currentColor" strokeOpacity="0.45" />
      <path d="M232 9H420" stroke="currentColor" strokeOpacity="0.45" />
      <path
        d="M210 9c-8-7-15-5-17-1 7 1 12 5 17 10V9Zm0 0c8-7 15-5 17-1-7 1-12 5-17 10V9Zm0 0V1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const SectionHeader = memo(function SectionHeader({
  backLabel,
  backTo,
  imageSrc,
  query = "",
  searchAction,
  searchLabel,
  searchPlaceholder,
  showSearch = true,
  title,
  description,
}: SectionHeaderProps) {
  const { cancelPending, formRef, scheduleSubmit } =
    useDebouncedFormSubmit(320, 2);
  const navigation = useNavigation();
  const isSearching = navigation.location?.pathname === searchAction;

  return (
    <header className="mb-[14px] grid gap-[10px] min-[768px]:mb-[18px] min-[768px]:gap-[14px]">
      <Link
        className={`inline-flex min-h-[32px] w-fit items-center gap-[7px] rounded-[10px] text-[13px] font-bold text-gold-bright no-underline transition-colors hover:text-ink ${focusRing}`}
        to={backTo}
      >
        <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
        {backLabel}
      </Link>
      {/*min-[768px]:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)] min-[768px]:gap-[28px]*/}
      <div className="grid items-center gap-[10px] ">
        {/*[190px] min-[960px]:h-full*/}
        <div className="flex min-h-[160px] w-full items-center justify-center min-[390px]:min-h-[180px] min-[768px]:h-full">
          <img
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
          <h1 className="m-0 w-full text-[30px] leading-[36px] font-normal tracking-[-0.7px] text-balance min-[390px]:text-[34px] min-[390px]:leading-[40px] min-[768px]:text-[44px] min-[768px]:leading-[50px] min-[960px]:text-[50px] min-[960px]:leading-[56px]">
            <PageTitle title={title} />
          </h1>
          {/*<BotanicalDivider />*/}
          <img src={divider2} alt="" width={1200} height={126} decoding="async" className='w-full h-[40px] object-contain'/>

          {description ? <p className="m-0 max-w-[620px] text-[13px] leading-[1.65] text-muted min-[768px]:text-[14px]">{description}</p> : null}

          {showSearch ? (
            <Form
              key={query}
              ref={formRef}
              className="flex min-h-[50px] w-full min-w-0 items-center gap-[10px] rounded-[16px] border border-glass-border bg-control px-[12px] text-faint shadow-card"
              action={searchAction}
              method="get"
              role="search"
              onSubmit={cancelPending}
              aria-busy={isSearching || undefined}
            >
              <Search aria-hidden="true" size={19} strokeWidth={1.9} />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
                type="search"
                name="q"
                defaultValue={query}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                autoComplete="off"
                minLength={2}
                onInput={scheduleSubmit}
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
              {isSearching ? (
                <LoaderCircle
                  className="animate-search-spin shrink-0 text-gold"
                  aria-hidden="true"
                  size={18}
                />
              ) : null}
            </Form>
          ) : null}
        </div>
      </div>
    </header>
  );
});
