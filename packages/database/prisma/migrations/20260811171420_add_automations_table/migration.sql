-- CreateEnum
CREATE TYPE "AutomationMatchMode" AS ENUM ('CONTAINS', 'WORD', 'EXACT');

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "instagram_account_id" TEXT NOT NULL,
    "zernio_automation_id" TEXT NOT NULL,
    "zernio_post_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "match_mode" "AutomationMatchMode" NOT NULL DEFAULT 'CONTAINS',
    "comment_reply" TEXT,
    "dm_message" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automations_zernio_automation_id_key" ON "automations"("zernio_automation_id");

-- CreateIndex
CREATE INDEX "automations_organization_id_idx" ON "automations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "automations_instagram_account_id_zernio_post_id_key" ON "automations"("instagram_account_id", "zernio_post_id");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
