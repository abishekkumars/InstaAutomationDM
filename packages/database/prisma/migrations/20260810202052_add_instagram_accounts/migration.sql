-- CreateEnum
CREATE TYPE "InstagramAccountStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "zernio_account_id" TEXT NOT NULL,
    "username" TEXT,
    "status" "InstagramAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_zernio_account_id_key" ON "instagram_accounts"("zernio_account_id");

-- CreateIndex
CREATE INDEX "instagram_accounts_organization_id_idx" ON "instagram_accounts"("organization_id");

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
