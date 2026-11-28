// Հարց ու պատասխան կենտրոն (`guide_questions`, migration 0060)։
import type { GuideStatus } from "./guides";

export const QUESTION_TOPICS = {
  faith: "Հավատք",
  sacraments: "Խորհուրդներ",
  liturgy: "Պատարագ և Հաղորդություն",
  fasting: "Պահք և տոներ",
  departed: "Ննջեցյալներ",
  family: "Ընտանիք",
  church: "Եկեղեցում",
} as const;
export type QuestionTopic = keyof typeof QUESTION_TOPICS;
export const isQuestionTopic = (value: unknown): value is QuestionTopic => typeof value === "string" && value in QUESTION_TOPICS;

export type GuideQuestion = { id: number; topic: QuestionTopic; question: string; answer: string; status: GuideStatus; sort: number };

/** Հարց տալ թիմին՝ բոտի միջոցով (հաղորդագրությունը գնում է Support խումբ)։ */
export const ASK_URL = "https://t.me/armenian_apostolic_church_bot?start=contact";

/** Որոնման բառը՝ պահելու համար (փոքրատառ, մեկ բացատ, մինչև 80 նիշ)։ */
export function missKey(query: string) {
  return query.toLocaleLowerCase("hy").replace(/\s+/gu, " ").trim().slice(0, 80);
}
