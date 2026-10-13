ALTER TABLE "trips" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
-- The Trips created before a Trip password became optional are opened to
-- everyone: their Trip password is taken away.
UPDATE "trips" SET "password_hash" = NULL, "wrong_password_count" = 0, "wrong_passwords_since" = NULL;
