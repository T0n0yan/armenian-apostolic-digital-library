import { LoaderCircle } from "lucide-react";
import { memo, useMemo } from "react";
import { Link, useNavigation } from "react-router";

import type { PublicMaterial } from "../data/materials.server";
import { isPendingNavigation } from "../../shared/navigation-state";
import { psalmNumber } from "../utils/psalm-number";

type CardMaterial = Pick<PublicMaterial, "id" | "title" | "excerpt" | "preview">;

/** Psalms as a grid of numbered tiles: the number is what readers look for. */
export const PsalmGrid = memo(function PsalmGrid({ materials }: { materials: CardMaterial[] }) {
  const navigation = useNavigation();
  const tiles = useMemo(() => materials
    .map((material) => ({ material, number: psalmNumber(material) }))
    .sort((left, right) => (left.number ?? Number.MAX_SAFE_INTEGER) - (right.number ?? Number.MAX_SAFE_INTEGER)),
  [materials]);

  return (
    <ol className="m-0 grid list-none grid-cols-5 gap-2 p-0 min-[420px]:grid-cols-6 min-[640px]:grid-cols-8 min-[960px]:grid-cols-10">
      {tiles.map(({ material, number }) => {
        const targetPath = `/materials/${material.id}`;
        const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
        return (
          <li key={material.id}>
            <Link
              className={`frosted-card grid aspect-square place-items-center rounded-[16px] text-inherit no-underline ${isOpening ? "is-opening" : ""}`}
              to={targetPath}
              prefetch="intent"
              aria-label={number ? `Սաղմոս ${number}${material.title ? `․ ${material.title}` : ""}` : material.title}
              title={material.title}
            >
              {isOpening
                ? <LoaderCircle className="animate-search-spin text-gold" aria-hidden="true" size={20} />
                : <span className="font-noto text-[20px] font-semibold tabular-nums text-gold-bright min-[640px]:text-[22px]">{number ?? "•"}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
});

/** Saints: the saint's picture fills the card, softly dimmed, with the name on top. */
export const SaintGrid = memo(function SaintGrid({ materials }: { materials: CardMaterial[] }) {
  const navigation = useNavigation();
  return (
    <ol className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 min-[720px]:grid-cols-3">
      {materials.map((material, index) => {
        const targetPath = `/materials/${material.id}`;
        const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
        const image = material.preview.imageUrl ?? material.preview.thumbnailUrl;
        return (
          <li key={material.id}>
            <Link
              className="group relative block aspect-[3/4] overflow-hidden rounded-[18px] border border-glass-border bg-[linear-gradient(160deg,rgb(124_74_143/45%),rgb(36_19_40/90%))] text-white no-underline shadow-card active:scale-[.985] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgb(217_181_111/45%)]"
              to={targetPath}
              prefetch="intent"
              aria-busy={isOpening || undefined}
            >
              {image ? (
                <img
                  className="absolute inset-0 h-full w-full object-cover object-top opacity-80 transition-[transform,opacity] duration-500 group-hover:scale-[1.03] group-hover:opacity-90"
                  src={image}
                  alt=""
                  loading={index < 4 ? "eager" : "lazy"}
                  decoding="async"
                />
              ) : null}
              <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_38%,rgb(14_6_18/55%)_62%,rgb(14_6_18/92%)_100%)]" aria-hidden="true" />
              <span className="absolute inset-x-0 bottom-0 grid gap-1 p-3 text-center">
                <span className="mx-auto h-px w-10 bg-[rgb(217_181_111/70%)]" aria-hidden="true" />
                <strong className="font-noto text-[14px] leading-[1.3] font-semibold tracking-[0.3px] text-balance text-[#fbf3e2] [text-shadow:0_1px_8px_rgb(0_0_0/60%)] min-[560px]:text-[16px]">
                  {material.title}
                </strong>
              </span>
              {isOpening ? <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/50"><LoaderCircle className="animate-search-spin text-[#f0d397]" aria-hidden="true" size={16} /></span> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
});

/** A topic's introduction post, shown as plain text above its grid: not a link, no actions. */
export const TopicIntro = memo(function TopicIntro({ material }: { material: CardMaterial }) {
  const title = material.title.replace(/[​-‍﻿]/gu, "").trim();
  const excerpt = material.excerpt?.replace(/[​-‍﻿]/gu, "").trim() ?? "";
  const body = excerpt.startsWith(title) ? excerpt.slice(title.length).replace(/^[\s.,:;։՝-]+/u, "") : excerpt;
  return (
    <section className="frosted-panel grid gap-1.5 px-5 py-4 text-center">
      <h3 className="m-0 font-noto text-[15px] font-semibold tracking-[0.4px] text-gold-bright">{title}</h3>
      {body ? <p className="m-0 text-[13px] leading-[1.6] text-muted">{body}</p> : null}
    </section>
  );
});
