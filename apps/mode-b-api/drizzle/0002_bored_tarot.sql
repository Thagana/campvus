CREATE TABLE "live_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"course_id" text NOT NULL,
	"seq" integer NOT NULL,
	"hash" text NOT NULL,
	"size" bigint NOT NULL,
	"timestamp" bigint NOT NULL,
	"signature" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_segments" ADD CONSTRAINT "live_segments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_segments_session_seq_unique" ON "live_segments" USING btree ("session_id","seq");