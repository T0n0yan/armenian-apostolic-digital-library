/**
 * Large artwork in two sizes, so phones download the 880px version (about a quarter of the full
 * size).
 */
import LastSupperFull from "./last-supper.webp";
import LastSupperSmall from "./last-supper-880.webp";
import MyCornerFull from "./my-corner.webp";
import MyCornerSmall from "./my-corner-880.webp";
import GospelTeachingFull from "./gospel-teaching.webp";
import GospelTeachingSmall from "./gospel-teaching-880.webp";
import DailyReadingsFull from "./daily-readings.webp";
import DailyReadingsSmall from "./daily-readings-880.webp";
import BibleQuestionsFull from "./bible-questions.webp";
import BibleQuestionsSmall from "./bible-questions-880.webp";
import PrayersFull from "./prayers.webp";
import PrayersSmall from "./prayers-880.webp";
import PsalmsFull from "./psalms.webp";
import PsalmsSmall from "./psalms-880.webp";
import SaintsLivesFull from "./saints-lives.webp";
import SaintsLivesSmall from "./saints-lives-880.webp";

type Responsive = { srcSet: string };

const IMAGES: Record<string, Responsive> = {
  [LastSupperFull]: { srcSet: `${LastSupperSmall} 880w, ${LastSupperFull} 1774w` },
  [MyCornerFull]: { srcSet: `${MyCornerSmall} 880w, ${MyCornerFull} 1774w` },
  [GospelTeachingFull]: { srcSet: `${GospelTeachingSmall} 880w, ${GospelTeachingFull} 1774w` },
  [DailyReadingsFull]: { srcSet: `${DailyReadingsSmall} 880w, ${DailyReadingsFull} 1774w` },
  [BibleQuestionsFull]: { srcSet: `${BibleQuestionsSmall} 880w, ${BibleQuestionsFull} 1774w` },
  [PrayersFull]: { srcSet: `${PrayersSmall} 880w, ${PrayersFull} 1774w` },
  [PsalmsFull]: { srcSet: `${PsalmsSmall} 880w, ${PsalmsFull} 1774w` },
  [SaintsLivesFull]: { srcSet: `${SaintsLivesSmall} 880w, ${SaintsLivesFull} 1774w` },
};

/** The srcSet of one of the large images, if it has one. */
export function responsiveImage(src: string): Responsive | null {
  return IMAGES[src] ?? null;
}
