import bibleQuestionsImage from "../assets/bible-questions.webp";
import dailyReadingsImage from "../assets/daily-readings.webp";
import gospelTeachingImage from "../assets/gospel-teaching.webp";
import prayersImage from "../assets/prayers.webp";
import psalmsImage from "../assets/psalms.webp";
import saintsLivesImage from "../assets/saints-lives.webp";
import { resolveContentCategoryId, type ContentCategoryId } from "../../shared/telegram-bridge-contract";

/** Բաժնի գլխի նկարը. առանձին ֆայլում է, որ մենյուն (ամեն էջում) չբերի բաժնի գլխի ամբողջ կոդը։ */
const CATEGORY_IMAGES: Record<ContentCategoryId, string> = {
  category_saints_lives: saintsLivesImage,
  category_gospel_teachings: gospelTeachingImage,
  category_psalms: psalmsImage,
  category_bible_questions: bibleQuestionsImage,
  category_prayers: prayersImage,
  category_daily_readings: dailyReadingsImage,
};

export function getCategoryImage(categoryId: string, categoryName?: string | null) {
  const resolved = resolveContentCategoryId(categoryId, categoryName);
  return (resolved && CATEGORY_IMAGES[resolved]) || saintsLivesImage;
}
