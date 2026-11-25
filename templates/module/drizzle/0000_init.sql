CREATE SCHEMA "sample";
--> statement-breakpoint
CREATE TABLE "sample"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "items_tenant_id_name_key" ON "sample"."items" USING btree ("tenant_id","name");