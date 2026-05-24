CREATE TABLE "match_bet_transfers" (
	"match_id" uuid NOT NULL,
	"bet_transfer_id" uuid NOT NULL,
	CONSTRAINT "match_bet_transfers_match_id_bet_transfer_id_pk" PRIMARY KEY("match_id","bet_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"winner_member_id" uuid NOT NULL,
	"loser_member_id" uuid NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	CONSTRAINT "chk_matches_distinct_members" CHECK ("matches"."winner_member_id" <> "matches"."loser_member_id")
);
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "match_loser_beer_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_bet_transfers" ADD CONSTRAINT "match_bet_transfers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bet_transfers" ADD CONSTRAINT "match_bet_transfers_bet_transfer_id_bet_transfers_id_fk" FOREIGN KEY ("bet_transfer_id") REFERENCES "public"."bet_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_member_id_members_id_fk" FOREIGN KEY ("winner_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_loser_member_id_members_id_fk" FOREIGN KEY ("loser_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_match_bet_transfers_match" ON "match_bet_transfers" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_matches_club_played" ON "matches" USING btree ("club_id","played_at");--> statement-breakpoint
CREATE INDEX "idx_matches_winner" ON "matches" USING btree ("winner_member_id","played_at");--> statement-breakpoint
CREATE INDEX "idx_matches_loser" ON "matches" USING btree ("loser_member_id","played_at");