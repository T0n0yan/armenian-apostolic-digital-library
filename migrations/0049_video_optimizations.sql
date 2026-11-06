-- Տեսանյութերի ավտոմատ սեղմում (scripts/optimize-videos.ts, աշխատում է cloud-sync-ից հետո)։
-- Մեկ տող ամեն ֆայլի համար։ result_key-ը այն բանալին է, որով ֆայլը հիմա տրվում է. եթե ֆայլի
-- բանալին արդեն այստեղ է, նորից չի սեղմվում (կրկնակի սեղմումը որակ կկորցներ)։
CREATE TABLE video_optimizations (
  result_key TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  -- 'pending'՝ սկսված է, ֆայլը դեռ կարող է չփոխարինված լինել. 'optimized'՝ փոխարինված է.
  -- 'kept'՝ բնօրինակը թողնված է (սեղմելը օգուտ չտվեց կամ ֆայլը չհաջողվեց կարդալ)
  status TEXT NOT NULL CHECK (status IN ('pending', 'optimized', 'kept')),
  original_bytes INTEGER NOT NULL CHECK (original_bytes >= 0),
  optimized_bytes INTEGER NOT NULL CHECK (optimized_bytes >= 0),
  -- Նոր տարբերակի նշան՝ հղման ?v=-ի համար, որ բրաուզերը և քեշը հին ֆայլը չտան
  version TEXT NOT NULL,
  -- Բնօրինակի պատճենը (14 օր), հետո ջնջվում է
  backup_key TEXT,
  backup_deleted_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_video_optimizations_backup ON video_optimizations(backup_deleted_at, created_at)
  WHERE backup_key IS NOT NULL;
