-- Տեսանյութը որ սեղմման կանոններով է պատրաստված (shared/video-optimize.ts, VIDEO_PROFILE)։
-- Կանոնները փոխելիս հին տարբերակով սեղմվածները նորից են սեղմվում բնօրինակից։
ALTER TABLE video_optimizations ADD COLUMN profile TEXT NOT NULL DEFAULT 'v1';
