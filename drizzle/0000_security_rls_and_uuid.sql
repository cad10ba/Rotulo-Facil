CREATE TABLE "recipes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'Geral' NOT NULL,
	"is_liquid" boolean DEFAULT false NOT NULL,
	"density" double precision DEFAULT 1 NOT NULL,
	"net_weight" double precision,
	"panel_area" double precision,
	"product_category" text DEFAULT 'geral' NOT NULL,
	"has_added_critical_ingredients" boolean DEFAULT false NOT NULL,
	"portion_size" double precision DEFAULT 50 NOT NULL,
	"household_measure" text DEFAULT '1 porção (50 g)' NOT NULL,
	"servings_per_package" text DEFAULT 'cerca de 5 porções' NOT NULL,
	"ready_weight_grams" double precision,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"declared_allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"may_contain_allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contains_gluten" boolean DEFAULT false NOT NULL,
	"gluten_status" text DEFAULT 'unconfirmed' NOT NULL,
	"contains_lactose" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_uid_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "recipes_user_isolation" ON "recipes" AS PERMISSIVE FOR ALL TO public USING ("recipes"."user_id" = current_setting('app.current_user_uid', true)) WITH CHECK ("recipes"."user_id" = current_setting('app.current_user_uid', true));--> statement-breakpoint
CREATE POLICY "users_self_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."uid" = current_setting('app.current_user_uid', true)) WITH CHECK ("users"."uid" = current_setting('app.current_user_uid', true));