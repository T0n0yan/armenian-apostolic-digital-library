-- Ձեռքով նշված Պատարագի առիթը (ոչ պարտադիր), օր.՝ «Սուրբ Գրիգոր Նարեկացու տոն»։
ALTER TABLE liturgy_marks ADD COLUMN note TEXT NOT NULL DEFAULT '';
