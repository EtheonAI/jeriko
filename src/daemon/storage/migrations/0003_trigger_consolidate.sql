-- 0003_trigger_consolidate.sql — Drop unused trigger_def table.
--
-- The original 0001_init.sql created a `trigger_def` table, but TriggerStore
-- independently creates `trigger_config` (with a richer schema). The engine
-- only uses trigger_config. Drop the unused table to avoid confusion.

DROP TABLE IF EXISTS trigger_def;
