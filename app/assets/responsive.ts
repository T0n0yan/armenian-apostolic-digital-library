/**
 * Large artwork in four sizes: 560px (հին/փոքր հեռախոսներ), 880px and 1200px for phones (a 3x screen needs ~1200px, which
 * is half the bytes of the full 1774px file), the full size for large screens.
 */
import LastSupperFull from "./last-supper.webp";
import LastSupperTiny from "./last-supper-560.webp";
import LastSupperSmall from "./last-supper-880.webp";
import LastSupperMedium from "./last-supper-1200.webp";
import MyCornerFull from "./my-corner.webp";
import MyCornerTiny from "./my-corner-560.webp";
import MyCornerSmall from "./my-corner-880.webp";
import MyCornerMedium from "./my-corner-1200.webp";
import GospelTeachingFull from "./gospel-teaching.webp";
import GospelTeachingTiny from "./gospel-teaching-560.webp";
import GospelTeachingSmall from "./gospel-teaching-880.webp";
import GospelTeachingMedium from "./gospel-teaching-1200.webp";
import DailyReadingsFull from "./daily-readings.webp";
import DailyReadingsTiny from "./daily-readings-560.webp";
import DailyReadingsSmall from "./daily-readings-880.webp";
import DailyReadingsMedium from "./daily-readings-1200.webp";
import BibleQuestionsFull from "./bible-questions.webp";
import BibleQuestionsTiny from "./bible-questions-560.webp";
import BibleQuestionsSmall from "./bible-questions-880.webp";
import BibleQuestionsMedium from "./bible-questions-1200.webp";
import PrayersFull from "./prayers.webp";
import PrayersTiny from "./prayers-560.webp";
import PrayersSmall from "./prayers-880.webp";
import PrayersMedium from "./prayers-1200.webp";
import PsalmsFull from "./psalms.webp";
import PsalmsTiny from "./psalms-560.webp";
import PsalmsSmall from "./psalms-880.webp";
import PsalmsMedium from "./psalms-1200.webp";
import SaintsLivesFull from "./saints-lives.webp";
import SaintsLivesTiny from "./saints-lives-560.webp";
import SaintsLivesSmall from "./saints-lives-880.webp";
import SaintsLivesMedium from "./saints-lives-1200.webp";

type Responsive = { srcSet: string };

const IMAGES: Record<string, Responsive> = {
  [LastSupperFull]: { srcSet: `${LastSupperTiny} 560w, ${LastSupperSmall} 880w, ${LastSupperMedium} 1200w, ${LastSupperFull} 1774w` },
  [MyCornerFull]: { srcSet: `${MyCornerTiny} 560w, ${MyCornerSmall} 880w, ${MyCornerMedium} 1200w, ${MyCornerFull} 1774w` },
  [GospelTeachingFull]: { srcSet: `${GospelTeachingTiny} 560w, ${GospelTeachingSmall} 880w, ${GospelTeachingMedium} 1200w, ${GospelTeachingFull} 1774w` },
  [DailyReadingsFull]: { srcSet: `${DailyReadingsTiny} 560w, ${DailyReadingsSmall} 880w, ${DailyReadingsMedium} 1200w, ${DailyReadingsFull} 1774w` },
  [BibleQuestionsFull]: { srcSet: `${BibleQuestionsTiny} 560w, ${BibleQuestionsSmall} 880w, ${BibleQuestionsMedium} 1200w, ${BibleQuestionsFull} 1774w` },
  [PrayersFull]: { srcSet: `${PrayersTiny} 560w, ${PrayersSmall} 880w, ${PrayersMedium} 1200w, ${PrayersFull} 1774w` },
  [PsalmsFull]: { srcSet: `${PsalmsTiny} 560w, ${PsalmsSmall} 880w, ${PsalmsMedium} 1200w, ${PsalmsFull} 1774w` },
  [SaintsLivesFull]: { srcSet: `${SaintsLivesTiny} 560w, ${SaintsLivesSmall} 880w, ${SaintsLivesMedium} 1200w, ${SaintsLivesFull} 1774w` },
};

/** The srcSet of one of the large images, if it has one. */
export function responsiveImage(src: string): Responsive | null {
  return IMAGES[src] ?? null;
}
