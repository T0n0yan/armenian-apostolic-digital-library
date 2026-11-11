-- Սրբավայրի նկարների չափերը (լայնություն × բարձրություն)։ Էջը նկարի տեղը պահում է նախապես,
-- որ բեռնվելիս տեքստը չցատկի (CLS)։ Լրացվում է ինքնուրույն՝ նկարի առաջին ցուցադրման ժամանակ։
CREATE TABLE IF NOT EXISTS place_photo_sizes (
  photo_key TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL
);
