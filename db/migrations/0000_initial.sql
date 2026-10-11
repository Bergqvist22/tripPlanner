CREATE TYPE "public"."category" AS ENUM('flight', 'car_rental', 'accommodation', 'activity', 'food', 'transport', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_basis" AS ENUM('total', 'per_person');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('suggestion', 'selected', 'booked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."travel_mode" AS ENUM('drive', 'flight', 'train', 'ferry', 'other');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid,
	"category" "category" NOT NULL,
	"title" text NOT NULL,
	"status" "status" DEFAULT 'suggestion' NOT NULL,
	"cost" numeric(12, 2),
	"currency" text NOT NULL,
	"cost_basis" "cost_basis" DEFAULT 'total' NOT NULL,
	"date" date,
	"time" time,
	"end_date" date,
	"place_label" text,
	"place_latitude" double precision,
	"place_longitude" double precision,
	"link" text DEFAULT '' NOT NULL,
	"booking_reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "items_accommodation_has_dates" CHECK ("items"."category" <> 'accommodation' OR ("items"."date" IS NOT NULL AND "items"."end_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"travel_mode" "travel_mode" DEFAULT 'drive' NOT NULL,
	"calculated_duration_seconds" integer,
	"calculated_distance_meters" integer,
	"calculated_geometry" jsonb,
	"manual_duration_seconds" integer,
	CONSTRAINT "legs_from_stop_id_to_stop_id_pk" PRIMARY KEY("from_stop_id","to_stop_id")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"arrival_date" date,
	"departure_date" date,
	"place_label" text,
	"place_latitude" double precision,
	"place_longitude" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"creator_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"traveller_count" integer NOT NULL,
	"display_currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_traveller_count_at_least_1" CHECK ("trips"."traveller_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_trip_id_idx" ON "items" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "items_stop_id_idx" ON "items" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "stops_trip_id_idx" ON "stops" USING btree ("trip_id");