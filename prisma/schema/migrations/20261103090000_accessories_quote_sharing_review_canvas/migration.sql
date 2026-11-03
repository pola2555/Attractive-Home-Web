-- Captures schema changes that were applied to dev via `db push` after the
-- 20260913 migration and never written as a migration: accessories (tables +
-- pricing tiers + images + attachments), quote add-ons/accessories JSON, quote
-- soft-delete + share tokens, product review status, configurator node/variant
-- images, multi-select nodes, and by-measure add-on fields. All additive.

-- AlterTable
ALTER TABLE "config_addons" ADD COLUMN     "measure_code" TEXT,
ADD COLUMN     "measure_label" TEXT,
ADD COLUMN     "measure_unit" TEXT,
ADD COLUMN     "range_max" DECIMAL(12,4),
ADD COLUMN     "range_min" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "config_price_nodes" ADD COLUMN     "images" JSONB,
ADD COLUMN     "multi_select" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "config_variants" ADD COLUMN     "images" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "review_status" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "accessories" JSONB,
ADD COLUMN     "addons" JSONB;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" UUID,
ADD COLUMN     "sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "share_token" TEXT;

-- CreateTable
CREATE TABLE "accessories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "color_name" TEXT,
    "color_hex" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'private',
    "owner_product_id" UUID,
    "pricing_mode" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_price_tiers" (
    "id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "unit_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "accessory_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_images" (
    "id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "accessory_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_attachments" (
    "id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "anchor_kind" TEXT NOT NULL,
    "anchor_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accessories_owner_product_id_idx" ON "accessories"("owner_product_id");

-- CreateIndex
CREATE INDEX "accessories_scope_idx" ON "accessories"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_price_tiers_accessory_id_min_qty_key" ON "accessory_price_tiers"("accessory_id", "min_qty");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_images_accessory_id_sort_order_key" ON "accessory_images"("accessory_id", "sort_order");

-- CreateIndex
CREATE INDEX "accessory_attachments_product_id_idx" ON "accessory_attachments"("product_id");

-- CreateIndex
CREATE INDEX "accessory_attachments_accessory_id_idx" ON "accessory_attachments"("accessory_id");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_attachments_accessory_id_product_id_anchor_kind_a_key" ON "accessory_attachments"("accessory_id", "product_id", "anchor_kind", "anchor_ref");

-- CreateIndex
CREATE INDEX "products_review_status_idx" ON "products"("review_status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_share_token_key" ON "quotes"("share_token");

-- CreateIndex
CREATE INDEX "quotes_deleted_at_idx" ON "quotes"("deleted_at");

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_owner_product_id_fkey" FOREIGN KEY ("owner_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_price_tiers" ADD CONSTRAINT "accessory_price_tiers_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_images" ADD CONSTRAINT "accessory_images_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_attachments" ADD CONSTRAINT "accessory_attachments_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_attachments" ADD CONSTRAINT "accessory_attachments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
