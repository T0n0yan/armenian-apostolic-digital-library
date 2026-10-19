import { type ComponentProps, memo } from "react";

import { CalendarIcon, CrossIcon, GospelIcon, PrayerIcon, PsalmIcon, QuestionIcon, SaintIcon } from "./topic-icons";

import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

type IconProps = ComponentProps<typeof CrossIcon>;

const categoryIcons: Record<string, (props: IconProps) => React.ReactElement> = {
  category_saints_lives: SaintIcon,
  category_gospel_teachings: GospelIcon,
  category_psalms: PsalmIcon,
  category_daily_readings: CalendarIcon,
  category_bible_questions: QuestionIcon,
  category_prayers: PrayerIcon,
};

export const CategoryIcon = memo(function CategoryIcon({
  categoryId,
  categoryName,
  ...props
}: IconProps & { categoryId: string; categoryName?: string | null }) {
  const resolved = resolveContentCategoryId(categoryId, categoryName);
  const Icon = (resolved && categoryIcons[resolved]) || CrossIcon;
  return <Icon {...props} />;
});
