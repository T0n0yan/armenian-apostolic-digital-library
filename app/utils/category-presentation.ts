const CATEGORY_ICONS: Record<string, string> = {
  category_saints_lives: "🕊️",
  category_gospel_teachings: "📚",
  category_psalms: "🪉",
  category_daily_readings: "📅",
  category_bible_questions: "❓",
  category_prayers: "🙏",
};

export function getCategoryIcon(categoryId: string) {
  return CATEGORY_ICONS[categoryId] ?? "✦";
}
