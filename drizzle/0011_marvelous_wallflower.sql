CREATE TYPE "public"."match_bet_debt_status" AS ENUM('pending', 'settled', 'voided');--> statement-breakpoint
CREATE TABLE "match_bet_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"planned_beer_type_id" uuid,
	"beer_count" smallint DEFAULT 1 NOT NULL,
	"status" "match_bet_debt_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"settled_at" timestamp with time zone,
	"settled_by_user_id" uuid,
	"settled_beer_type_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	CONSTRAINT "chk_match_bet_debts_distinct_members" CHECK ("match_bet_debts"."from_member_id" <> "match_bet_debts"."to_member_id"),
	CONSTRAINT "chk_match_bet_debts_beer_count_positive" CHECK ("match_bet_debts"."beer_count" >= 1),
	CONSTRAINT "chk_match_bet_debts_status_consistency" CHECK (("match_bet_debts"."status" = 'settled' AND "match_bet_debts"."settled_at" IS NOT NULL AND "match_bet_debts"."voided_at" IS NULL)
       OR ("match_bet_debts"."status" = 'voided' AND "match_bet_debts"."voided_at" IS NOT NULL AND "match_bet_debts"."settled_at" IS NULL)
       OR ("match_bet_debts"."status" = 'pending' AND "match_bet_debts"."settled_at" IS NULL AND "match_bet_debts"."voided_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "match_agreements" ADD COLUMN "bet_beer_type_id" uuid;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_agreement_id_match_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."match_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_planned_beer_type_id_beer_types_id_fk" FOREIGN KEY ("planned_beer_type_id") REFERENCES "public"."beer_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_settled_by_user_id_user_id_fk" FOREIGN KEY ("settled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_settled_beer_type_id_beer_types_id_fk" FOREIGN KEY ("settled_beer_type_id") REFERENCES "public"."beer_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_debts" ADD CONSTRAINT "match_bet_debts_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_match_bet_debts_from_pending" ON "match_bet_debts" USING btree ("from_member_id") WHERE "match_bet_debts"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_match_bet_debts_to_pending" ON "match_bet_debts" USING btree ("to_member_id") WHERE "match_bet_debts"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_match_bet_debts_agreement" ON "match_bet_debts" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "idx_match_bet_debts_match" ON "match_bet_debts" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_bet_debts_club" ON "match_bet_debts" USING btree ("club_id","created_at");--> statement-breakpoint
ALTER TABLE "match_agreements" ADD CONSTRAINT "match_agreements_bet_beer_type_id_beer_types_id_fk" FOREIGN KEY ("bet_beer_type_id") REFERENCES "public"."beer_types"("id") ON DELETE set null ON UPDATE no action;