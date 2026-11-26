-- 3D եկեղեցու «Վառել մոմ»՝ անանուն, օրը մեկ անգամ ամեն սարքից ամեն եկեղեցում։
-- church՝ «template:<id>» կամ «place:<id>», day՝ Երևանի օր (YYYY-MM-DD)։
-- visitor-ը միակողմանի hash է (օր + եկեղեցի + սարքի պատահական նշան). հաջորդ օրը նույն սարքը չի կապվում, հաշիվ չկա։
CREATE TABLE church_candles (
  church TEXT NOT NULL,
  day TEXT NOT NULL,
  slot INTEGER NOT NULL,
  visitor TEXT NOT NULL,
  lit_at INTEGER NOT NULL,
  PRIMARY KEY (church, day, slot)
);
CREATE INDEX church_candles_visitor ON church_candles (church, day, visitor);

-- Օրվա ընդհանուր թիվը (սեղանին տեղ կա 60 մոմի համար, նորերը փոխարինում են ամենահներին)։
CREATE TABLE church_candle_totals (
  church TEXT NOT NULL,
  day TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (church, day)
);
