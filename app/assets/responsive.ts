/**
 * Large artwork in three sizes: 880px and 1200px for phones (a 3x screen needs ~1200px, which
 * is half the bytes of the full 1774px file), the full size for large screens.
 */
import LastSupperFull from "./last-supper.webp";
import LastSupperSmall from "./last-supper-880.webp";
import LastSupperMedium from "./last-supper-1200.webp";
import MyCornerFull from "./my-corner.webp";
import MyCornerSmall from "./my-corner-880.webp";
import MyCornerMedium from "./my-corner-1200.webp";
import GospelTeachingFull from "./gospel-teaching.webp";
import GospelTeachingSmall from "./gospel-teaching-880.webp";
import GospelTeachingMedium from "./gospel-teaching-1200.webp";
import DailyReadingsFull from "./daily-readings.webp";
import DailyReadingsSmall from "./daily-readings-880.webp";
import DailyReadingsMedium from "./daily-readings-1200.webp";
import BibleQuestionsFull from "./bible-questions.webp";
import BibleQuestionsSmall from "./bible-questions-880.webp";
import BibleQuestionsMedium from "./bible-questions-1200.webp";
import PrayersFull from "./prayers.webp";
import PrayersSmall from "./prayers-880.webp";
import PrayersMedium from "./prayers-1200.webp";
import PsalmsFull from "./psalms.webp";
import PsalmsSmall from "./psalms-880.webp";
import PsalmsMedium from "./psalms-1200.webp";
import SaintsLivesFull from "./saints-lives.webp";
import SaintsLivesSmall from "./saints-lives-880.webp";
import SaintsLivesMedium from "./saints-lives-1200.webp";

type Responsive = { srcSet: string };

const IMAGES: Record<string, Responsive> = {
  [LastSupperFull]: { srcSet: `${LastSupperSmall} 880w, ${LastSupperMedium} 1200w, ${LastSupperFull} 1774w` },
  [MyCornerFull]: { srcSet: `${MyCornerSmall} 880w, ${MyCornerMedium} 1200w, ${MyCornerFull} 1774w` },
  [GospelTeachingFull]: { srcSet: `${GospelTeachingSmall} 880w, ${GospelTeachingMedium} 1200w, ${GospelTeachingFull} 1774w` },
  [DailyReadingsFull]: { srcSet: `${DailyReadingsSmall} 880w, ${DailyReadingsMedium} 1200w, ${DailyReadingsFull} 1774w` },
  [BibleQuestionsFull]: { srcSet: `${BibleQuestionsSmall} 880w, ${BibleQuestionsMedium} 1200w, ${BibleQuestionsFull} 1774w` },
  [PrayersFull]: { srcSet: `${PrayersSmall} 880w, ${PrayersMedium} 1200w, ${PrayersFull} 1774w` },
  [PsalmsFull]: { srcSet: `${PsalmsSmall} 880w, ${PsalmsMedium} 1200w, ${PsalmsFull} 1774w` },
  [SaintsLivesFull]: { srcSet: `${SaintsLivesSmall} 880w, ${SaintsLivesMedium} 1200w, ${SaintsLivesFull} 1774w` },
};

/** The srcSet of one of the large images, if it has one. */
export function responsiveImage(src: string): Responsive | null {
  return IMAGES[src] ?? null;
}
