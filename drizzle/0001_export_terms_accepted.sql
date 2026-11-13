ALTER TABLE "recipes" ADD COLUMN "export_terms_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "export_terms_accepted_at" timestamp;