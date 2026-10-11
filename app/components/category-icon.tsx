import {
  Bird,
  BookOpenCheck,
  BookOpenText,
  CalendarDays,
  HandHeart,
  Sparkles,
  type LucideProps,
} from "lucide-react";
import { memo } from "react";

function HarpIcon({ size = 22 }: LucideProps) {
  const fontSize = typeof size === "number" ? `${size * 1.12}px` : size;
  return (
    <span className="category-harp-icon" style={{ fontSize }} aria-hidden="true">
      🪉
    </span>
  );
}

const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
  category_saints_lives: Bird,
  category_gospel_teachings: BookOpenText,
  category_psalms: HarpIcon,
  category_daily_readings: CalendarDays,
  category_bible_questions: BookOpenCheck,
  category_prayers: HandHeart,
};

export const CategoryIcon = memo(function CategoryIcon({
  categoryId,
  ...props
}: LucideProps & { categoryId: string }) {
  const Icon = categoryIcons[categoryId] ?? Sparkles;
  return <Icon {...props} />;
});
