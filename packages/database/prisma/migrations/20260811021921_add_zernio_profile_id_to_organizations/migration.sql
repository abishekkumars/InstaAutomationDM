-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "zernio_profile_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_zernio_profile_id_key" ON "organizations"("zernio_profile_id");
