-- CreateEnum
CREATE TYPE "TemplateTriggerType" AS ENUM ('KEYWORDS', 'ANY_COMMENT');

-- CreateTable
CREATE TABLE "automation_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" "TemplateTriggerType" NOT NULL DEFAULT 'KEYWORDS',
    "keywords" TEXT[],
    "match_mode" "AutomationMatchMode" NOT NULL DEFAULT 'CONTAINS',
    "audience" "AutomationAudience" NOT NULL DEFAULT 'ANY',
    "comment_reply" TEXT,
    "comment_reply_variations" TEXT[],
    "dm_message" TEXT,
    "buttons" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_templates_organization_id_created_at_idx" ON "automation_templates"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
