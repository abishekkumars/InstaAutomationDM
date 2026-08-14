-- CreateEnum
CREATE TYPE "AutomationAudience" AS ENUM ('ANY', 'FOLLOWER', 'NON_FOLLOWER');

-- AlterTable
ALTER TABLE "automations" ADD COLUMN     "audience" "AutomationAudience" NOT NULL DEFAULT 'ANY',
ADD COLUMN     "comment_reply_variations" TEXT[];
