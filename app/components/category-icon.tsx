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
      <path d="M7 3.5c0 3-2 4.4-2 8.3C5 16.4 8 19 12 19s7-2.6 7-7.2c0-3.9-2-5.3-2-8.3" />
      <path d="M7 4.5c1.5 1.2 3.2 1.8 5 1.8s3.5-.6 5-1.8" />
      <path d="M6 10h12" />
      <path d="M9 10v7.7" />
      <path d="M12 10v9" />
      <path d="M15 10v7.7" />
      <path d="M8.5 21h7" />
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
