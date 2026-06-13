CREATE TABLE "member_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"badge_key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_member_achievements_member_badge" ON "member_achievements" USING btree ("member_id","badge_key");--> statement-breakpoint
CREATE INDEX "idx_member_achievements_member" ON "member_achievements" USING btree ("member_id");