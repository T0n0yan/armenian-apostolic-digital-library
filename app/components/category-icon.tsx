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

function HarpIcon({ size = 22, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3v14.5a3.5 3.5 0 0 0 7 0V7" />
      <path d="M6 4c5.2 0 8.4 1.5 11 4.5" />
      <path d="M8.8 5.1v11.6" />
      <path d="M11.6 5.9v10" />
      <path d="M14.3 7v7.1" />
      <path d="M17 8.5v3.7" />
    </svg>
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
