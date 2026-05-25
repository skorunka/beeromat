CREATE TYPE "public"."match_format" AS ENUM('singles', 'doubles');--> statement-breakpoint
CREATE TYPE "public"."match_pairing_kind" AS ENUM('straight', 'crossed');--> statement-breakpoint
CREATE TABLE "match_agreement_sides" (
	"agreement_id" uuid NOT NULL,
	"side" text NOT NULL,
	"seat" smallint NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "match_agreement_sides_agreement_id_side_seat_pk" PRIMARY KEY("agreement_id","side","seat"),
	CONSTRAINT "uq_match_agreement_sides_distinct_members" UNIQUE("agreement_id","member_id"),
	CONSTRAINT "chk_match_agreement_sides_side" CHECK ("match_agreement_sides"."side" IN ('A', 'B')),
	CONSTRAINT "chk_match_agreement_sides_seat" CHECK ("match_agreement_sides"."seat" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "match_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"format" "match_format" NOT NULL,
	"for_beer" boolean NOT NULL,
	"pairing_kind" "match_pairing_kind",
	"winning_side" text,
	"result_recorded_at" timestamp with time zone,
	"result_recorded_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	CONSTRAINT "chk_match_agreements_pairing_when_doubles" CHECK (("match_agreements"."format" = 'doubles' AND "match_agreements"."pairing_kind" IS NOT NULL) OR ("match_agreements"."format" = 'singles' AND "match_agreements"."pairing_kind" IS NULL)),
	CONSTRAINT "chk_match_agreements_winning_side" CHECK ("match_agreements"."winning_side" IS NULL OR "match_agreements"."winning_side" IN ('A', 'B')),
	CONSTRAINT "chk_match_agreements_cancel_xor_result" CHECK ("match_agreements"."cancelled_at" IS NULL OR ("match_agreements"."result_recorded_at" IS NULL AND "match_agreements"."reversed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "match_agreement_sides" ADD CONSTRAINT "match_agreement_sides_agreement_id_match_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."match_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreement_sides" ADD CONSTRAINT "match_agreement_sides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_result_recorded_by_user_id_user_id_fk" FOREIGN KEY ("result_recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_reversed_by_user_id_user_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_match_agreement_sides_agreement" ON "match_agreement_sides" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "idx_match_agreement_sides_member" ON "match_agreement_sides" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_match_agreements_club_open" ON "match_agreements" USING btree ("club_id","created_at") WHERE "match_agreements"."result_recorded_at" IS NULL AND "match_agreements"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_match_agreements_club_recorded" ON "match_agreements" USING btree ("club_id","result_recorded_at") WHERE "match_agreements"."result_recorded_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_agreement_id_match_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."match_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_matches_agreement" ON "matches" USING btree ("agreement_id");