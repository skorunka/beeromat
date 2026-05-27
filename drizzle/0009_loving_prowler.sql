CREATE TABLE "avatar_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"image" "bytea" NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatar_uploads_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "avatar_upload_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "avatar_uploads" ADD CONSTRAINT "avatar_uploads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;