import {
  Bird,
  BookOpenText,
  CalendarDays,
  CircleHelp,
  HandHeart,
  Music2,
  Sparkles,
  type LucideProps,
} from "lucide-react";
import { memo } from "react";

const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
  category_saints_lives: Bird,
  category_gospel_teachings: BookOpenText,
  category_psalms: Music2,
  category_daily_readings: CalendarDays,
  category_bible_questions: CircleHelp,
  category_prayers: HandHeart,
};

export const CategoryIcon = memo(function CategoryIcon({
  categoryId,
  ...props
}: LucideProps & { categoryId: string }) {
  const Icon = categoryIcons[categoryId] ?? Sparkles;
  return <Icon {...props} />;
});
