-- Phase 17, migration A (additive and reversible).
--
-- Adds the Meta connection table and moves the automation pivot onto Instagram's own media id.
-- `platform_post_id` is nullable HERE ON PURPOSE: existing rows are backfilled from Zernio's
-- listPosts after this migration applies, and only once that backfill is verified complete does
-- migration B make the column required and drop `zernio_post_id`.
--
-- Postgres treats NULLs as distinct in a unique index, so the new unique constraint below is
-- inert for un-backfilled rows rather than blocking them.
--
-- See docs/ADR/0009-direct-meta-graph-api-for-post-listing.md.

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('CONNECTED', 'RECONNECT_REQUIRED');

-- AlterTable
ALTER TABLE "automations" ADD COLUMN     "platform_post_id" TEXT,
ALTER COLUMN "zernio_post_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "instagram_account_id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_connections_instagram_account_id_key" ON "meta_connections"("instagram_account_id");

-- CreateIndex
CREATE INDEX "meta_connections_organization_id_idx" ON "meta_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "automations_instagram_account_id_platform_post_id_key" ON "automations"("instagram_account_id", "platform_post_id");

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

