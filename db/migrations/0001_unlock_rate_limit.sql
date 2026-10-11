ALTER TABLE "trips" ADD COLUMN "wrong_password_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "wrong_passwords_since" timestamp with time zone;