-- CreateTable
CREATE TABLE "config_addon_links" (
    "id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "target_addon_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_addon_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_addon_links_target_addon_id_idx" ON "config_addon_links"("target_addon_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_addon_links_addon_id_target_addon_id_key" ON "config_addon_links"("addon_id", "target_addon_id");

-- AddForeignKey
ALTER TABLE "config_addon_links" ADD CONSTRAINT "config_addon_links_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "config_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_addon_links" ADD CONSTRAINT "config_addon_links_target_addon_id_fkey" FOREIGN KEY ("target_addon_id") REFERENCES "config_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
