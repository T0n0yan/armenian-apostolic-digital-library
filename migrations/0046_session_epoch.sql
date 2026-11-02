-- «Ելք բոլոր սարքերից». ամեն մուտքի cookie-ում պահվում է այս թիվը. մարդը բարձրացնում է այն, և բոլոր
-- հին սարքերի cookie-ները դադարում են գործել (session_epoch-ը չի համընկնում)։
ALTER TABLE app_users ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;
