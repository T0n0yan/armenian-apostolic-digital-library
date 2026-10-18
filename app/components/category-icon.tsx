import { type LucideProps, Sparkles } from "lucide-react";
import { memo } from "react";

import { BooksIcon, CalendarIcon, DoveIcon, LyreIcon, PrayerIcon, QuestionBookIcon } from "./topic-icons";

import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
  category_saints_lives: DoveIcon as React.ComponentType<LucideProps>,
  category_gospel_teachings: BooksIcon as React.ComponentType<LucideProps>,
  category_psalms: LyreIcon as React.ComponentType<LucideProps>,
  category_daily_readings: CalendarIcon as React.ComponentType<LucideProps>,
  category_bible_questions: QuestionBookIcon as React.ComponentType<LucideProps>,
  category_prayers: PrayerIcon as React.ComponentType<LucideProps>,
};

export const CategoryIcon = memo(function CategoryIcon({
  categoryId,
  categoryName,
  ...props
}: LucideProps & { categoryId: string; categoryName?: string | null }) {
  const resolved = resolveContentCategoryId(categoryId, categoryName);
  const Icon = (resolved && categoryIcons[resolved]) || Sparkles;
  return <Icon {...props} />;
});
