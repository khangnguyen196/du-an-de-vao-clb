CREATE TABLE "card_notes" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"senses" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_notes_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "card_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"total" integer NOT NULL,
	"correct" integer NOT NULL,
	"wrong_ids" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_cards" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"term" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"scheduling" jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"first_reviewed_at" timestamp with time zone,
	"in_book" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cards_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "review_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_notes" ADD CONSTRAINT "card_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_scope_idx" ON "quiz_attempts" USING btree ("user_id","scope","taken_at");--> statement-breakpoint
CREATE INDEX "review_cards_user_due_idx" ON "review_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE POLICY "card_notes_own_rows" ON "card_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "user_id") WITH CHECK ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "quiz_attempts_own_rows" ON "quiz_attempts" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "user_id") WITH CHECK ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "review_cards_own_rows" ON "review_cards" AS PERMISSIVE FOR ALL TO "authenticated" USING ((select auth.uid()) = "user_id") WITH CHECK ((select auth.uid()) = "user_id");