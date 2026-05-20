CREATE TABLE "bet_transfer_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"bet_transfer_id" uuid NOT NULL,
	"reason" text,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bet_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"source_consumption_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	CONSTRAINT "chk_bet_transfers_distinct_members" CHECK ("bet_transfers"."from_member_id" <> "bet_transfers"."to_member_id")
);
--> statement-breakpoint
ALTER TABLE "bet_transfer_voids" ADD CONSTRAINT "bet_transfer_voids_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfer_voids" ADD CONSTRAINT "bet_transfer_voids_bet_transfer_id_bet_transfers_id_fk" FOREIGN KEY ("bet_transfer_id") REFERENCES "public"."bet_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfer_voids" ADD CONSTRAINT "bet_transfer_voids_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfers" ADD CONSTRAINT "bet_transfers_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfers" ADD CONSTRAINT "bet_transfers_source_consumption_id_consumptions_id_fk" FOREIGN KEY ("source_consumption_id") REFERENCES "public"."consumptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfers" ADD CONSTRAINT "bet_transfers_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfers" ADD CONSTRAINT "bet_transfers_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_transfers" ADD CONSTRAINT "bet_transfers_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_bet_transfer_voids_transfer" ON "bet_transfer_voids" USING btree ("bet_transfer_id");--> statement-breakpoint
CREATE INDEX "idx_bet_transfers_from_member" ON "bet_transfers" USING btree ("from_member_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_bet_transfers_to_member" ON "bet_transfers" USING btree ("to_member_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_bet_transfers_source" ON "bet_transfers" USING btree ("source_consumption_id");