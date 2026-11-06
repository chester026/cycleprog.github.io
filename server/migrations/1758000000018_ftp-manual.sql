-- Rider-set FTP (docs/plans/ride-power-insights.md, owner decision
-- 06.11.2026): a value from a formal 20-min test or the rider's head unit
-- (Garmin auto-detects ~10 % above our conservative 95 %-of-best-20-min
-- estimate) overrides the estimate everywhere it is used — zones, IF/TSS,
-- the power profile, the coach. NULL = use the estimate. `ftp_manual_set_at`
-- is shown as the "as of" date and lets a stale manual value be flagged later.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ftp_manual INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ftp_manual_set_at TIMESTAMPTZ;
