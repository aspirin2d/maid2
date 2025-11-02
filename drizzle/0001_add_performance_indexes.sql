-- Migration: Add performance indexes
-- Created: 2025-11-02
-- This migration adds indexes to improve query performance for frequently accessed columns

-- Add index on story.user_id for faster user story lookups
CREATE INDEX IF NOT EXISTS "story_user_id_idx" ON "story" USING btree ("user_id");

-- Add indexes on message table for performance optimization
CREATE INDEX IF NOT EXISTS "message_story_id_idx" ON "message" USING btree ("story_id");
CREATE INDEX IF NOT EXISTS "message_extracted_idx" ON "message" USING btree ("extracted");
CREATE INDEX IF NOT EXISTS "message_story_extracted_idx" ON "message" USING btree ("story_id", "extracted");
