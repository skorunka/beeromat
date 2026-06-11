ALTER TABLE "clubs" ALTER COLUMN "device_inactivity_lock_seconds" SET DEFAULT 2592000;
--> statement-breakpoint
-- Bump existing clubs still on the old 8h default to the new 30-day
-- window. Guarded to the old default so a club that was deliberately
-- set to some other value is left untouched.
UPDATE "clubs" SET "device_inactivity_lock_seconds" = 2592000 WHERE "device_inactivity_lock_seconds" = 28800;