-- AlterTable
ALTER TABLE "config_templates" ADD COLUMN     "hs_code_id" UUID;

-- CreateIndex
CREATE INDEX "config_templates_hs_code_id_idx" ON "config_templates"("hs_code_id");

-- AddForeignKey
ALTER TABLE "config_templates" ADD CONSTRAINT "config_templates_hs_code_id_fkey" FOREIGN KEY ("hs_code_id") REFERENCES "hs_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
