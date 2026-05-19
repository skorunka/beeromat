CREATE TABLE "beer_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	CONSTRAINT "beer_types_stock_non_negative" CHECK ("beer_types"."current_stock" >= 0),
	CONSTRAINT "beer_types_threshold_non_negative" CHECK ("beer_types"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"beer_type_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" "stock_change_kind" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drink_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"opened_by_user_id" uuid NOT NULL,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumption_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"consumption_id" uuid NOT NULL,
	"reason" text,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"drink_session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"beer_type_id" uuid NOT NULL,
	"unit_price_minor_snapshot" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beer_types" ADD CONSTRAINT "beer_types_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beer_types" ADD CONSTRAINT "beer_types_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_changes" ADD CONSTRAINT "stock_changes_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_changes" ADD CONSTRAINT "stock_changes_beer_type_id_beer_types_id_fk" FOREIGN KEY ("beer_type_id") REFERENCES "public"."beer_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_changes" ADD CONSTRAINT "stock_changes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sessions" ADD CONSTRAINT "drink_sessions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sessions" ADD CONSTRAINT "drink_sessions_opened_by_user_id_user_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sessions" ADD CONSTRAINT "drink_sessions_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_voids" ADD CONSTRAINT "consumption_voids_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_voids" ADD CONSTRAINT "consumption_voids_consumption_id_consumptions_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."consumptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_voids" ADD CONSTRAINT "consumption_voids_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_drink_session_id_drink_sessions_id_fk" FOREIGN KEY ("drink_session_id") REFERENCES "public"."drink_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_beer_type_id_beer_types_id_fk" FOREIGN KEY ("beer_type_id") REFERENCES "public"."beer_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumptions" ADD CONSTRAINT "consumptions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_beer_types_club_active_order" ON "beer_types" USING btree ("club_id","is_archived","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_beer_types_club_name_active" ON "beer_types" USING btree ("club_id","name") WHERE "beer_types"."is_archived" = false;--> statement-breakpoint
CREATE INDEX "idx_stock_changes_beer_created" ON "stock_changes" USING btree ("beer_type_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_drink_sessions_club_open" ON "drink_sessions" USING btree ("club_id") WHERE "drink_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_drink_sessions_club_started" ON "drink_sessions" USING btree ("club_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_consumption_voids_consumption" ON "consumption_voids" USING btree ("consumption_id");--> statement-breakpoint
CREATE INDEX "idx_consumption_voids_club_voided" ON "consumption_voids" USING btree ("club_id","voided_at");--> statement-breakpoint
CREATE INDEX "idx_consumptions_session_member" ON "consumptions" USING btree ("drink_session_id","member_id");--> statement-breakpoint
CREATE INDEX "idx_consumptions_member_created" ON "consumptions" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_consumptions_club_created" ON "consumptions" USING btree ("club_id","created_at");