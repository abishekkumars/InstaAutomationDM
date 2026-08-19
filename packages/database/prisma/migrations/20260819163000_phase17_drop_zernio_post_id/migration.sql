-- Phase 17, migration B. DESTRUCTIVE AND NOT REVERSIBLE.
--
-- Drops `zernio_post_id` and makes `platform_post_id` required, completing the pivot onto
-- Instagram's own media id.
--
-- PREREQUISITE, on every database this is applied to:
--   1. migration A (20260819154500_...) applied
--   2. dev/phase17-backfill-platform-post-id.mjs run to completion, exiting 0
--   3. dev/phase17-backfill-check.mjs reporting missingPlatformPostId: 0
--
-- Without the backfill, `SET NOT NULL` fails on any pre-existing row and the migration aborts.
-- That failure is the safety net working, not a bug - do not force past it by deleting rows
-- blindly; an unresolvable automation means Zernio no longer knows about it either.
--
-- See docs/ADR/0009-direct-meta-graph-api-for-post-listing.md.

-- DropIndex
DROP INDEX "automations_instagram_account_id_zernio_post_id_key";

-- AlterTable
ALTER TABLE "automations" DROP COLUMN "zernio_post_id",
ALTER COLUMN "platform_post_id" SET NOT NULL;

