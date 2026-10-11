CREATE TABLE "exchange_rates" (
	"currency" text PRIMARY KEY NOT NULL,
	"per_euro" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
