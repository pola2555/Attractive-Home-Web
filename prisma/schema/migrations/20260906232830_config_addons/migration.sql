-- AlterTable
ALTER TABLE "config_price_nodes" ADD COLUMN     "addon_id" UUID;

-- CreateTable
CREATE TABLE "config_addons" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_addon_attachments" (
    "id" UUID NOT NULL,
    "addon_id" UUID NOT NULL,
    "base_node_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_addon_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_addons_variant_id_idx" ON "config_addons"("variant_id");

-- CreateIndex
CREATE INDEX "config_addon_attachments_base_node_id_idx" ON "config_addon_attachments"("base_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_addon_attachments_addon_id_base_node_id_key" ON "config_addon_attachments"("addon_id", "base_node_id");

-- CreateIndex
CREATE INDEX "config_price_nodes_addon_id_idx" ON "config_price_nodes"("addon_id");

-- AddForeignKey
ALTER TABLE "config_addons" ADD CONSTRAINT "config_addons_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_addon_attachments" ADD CONSTRAINT "config_addon_attachments_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "config_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_addon_attachments" ADD CONSTRAINT "config_addon_attachments_base_node_id_fkey" FOREIGN KEY ("base_node_id") REFERENCES "config_price_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_nodes" ADD CONSTRAINT "config_price_nodes_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "config_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
