CREATE TABLE "payment_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"status" "payment_status" NOT NULL,
	"origin" "payment_origin" NOT NULL,
	"variable_symbol" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_state_transitions" ADD CONSTRAINT "payment_state_transitions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_state_transitions" ADD CONSTRAINT "payment_state_transitions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_state_transitions" ADD CONSTRAINT "payment_state_transitions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_transitions_payment" ON "payment_state_transitions" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_transitions_club_created" ON "payment_state_transitions" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_payments_club_status" ON "payments" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_payments_member_status" ON "payments" USING btree ("member_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payments_club_vs" ON "payments" USING btree ("club_id","variable_symbol") WHERE "payments"."variable_symbol" IS NOT NULL;