-- DropIndex
DROP INDEX "config_template_options_template_id_group_id_key";

-- AlterTable
ALTER TABLE "config_template_option_values" ADD COLUMN     "config_text" TEXT,
ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "config_template_options" ADD COLUMN     "config_text" TEXT,
ADD COLUMN     "variant_id" UUID;

-- AlterTable
ALTER TABLE "config_templates" ADD COLUMN     "standard_note" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'stock',
ALTER COLUMN "legacy_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "config_variants" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "included_spec" TEXT,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_price_grids" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_price_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_price_grid_axes" (
    "id" UUID NOT NULL,
    "grid_id" UUID NOT NULL,
    "template_option_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "config_price_grid_axes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_price_cells" (
    "id" UUID NOT NULL,
    "grid_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "coords" JSONB NOT NULL,
    "amount" DECIMAL(12,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_price_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_upgrades" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "variant_id" UUID,
    "section" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'upgrade',
    "amount" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'flat',
    "quantity_code" TEXT,
    "default_qty" INTEGER NOT NULL DEFAULT 1,
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "max_qty" INTEGER,
    "product_id" UUID,
    "condition" JSONB,
    "unavailable_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_upgrade_tiers" (
    "id" UUID NOT NULL,
    "upgrade_id" UUID NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "unit_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "config_upgrade_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_upgrade_effects" (
    "id" UUID NOT NULL,
    "upgrade_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "template_option_id" UUID,
    "value_codes" JSONB,
    "message" TEXT,

    CONSTRAINT "config_upgrade_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_bands" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "variant_id" UUID,
    "template_option_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "min_value" DECIMAL(12,4),
    "max_value" DECIMAL(12,4),
    "amount" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_variants_template_id_sort_order_idx" ON "config_variants"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "config_variants_template_id_code_key" ON "config_variants"("template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "config_price_grids_variant_id_key" ON "config_price_grids"("variant_id");

-- CreateIndex
CREATE INDEX "config_price_grid_axes_template_option_id_idx" ON "config_price_grid_axes"("template_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_price_grid_axes_grid_id_position_key" ON "config_price_grid_axes"("grid_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "config_price_grid_axes_grid_id_template_option_id_key" ON "config_price_grid_axes"("grid_id", "template_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_price_cells_grid_id_key_key" ON "config_price_cells"("grid_id", "key");

-- CreateIndex
CREATE INDEX "config_upgrades_template_id_sort_order_idx" ON "config_upgrades"("template_id", "sort_order");

-- CreateIndex
CREATE INDEX "config_upgrades_variant_id_idx" ON "config_upgrades"("variant_id");

-- CreateIndex
CREATE INDEX "config_upgrades_product_id_idx" ON "config_upgrades"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_upgrades_template_id_code_key" ON "config_upgrades"("template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "config_upgrade_tiers_upgrade_id_min_qty_key" ON "config_upgrade_tiers"("upgrade_id", "min_qty");

-- CreateIndex
CREATE INDEX "config_upgrade_effects_upgrade_id_idx" ON "config_upgrade_effects"("upgrade_id");

-- CreateIndex
CREATE INDEX "config_upgrade_effects_template_option_id_idx" ON "config_upgrade_effects"("template_option_id");

-- CreateIndex
CREATE INDEX "config_bands_template_option_id_sort_order_idx" ON "config_bands"("template_option_id", "sort_order");

-- CreateIndex
CREATE INDEX "config_bands_variant_id_idx" ON "config_bands"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_bands_template_id_code_key" ON "config_bands"("template_id", "code");

-- CreateIndex
CREATE INDEX "config_template_options_variant_id_idx" ON "config_template_options"("variant_id");

-- AddForeignKey
ALTER TABLE "config_template_options" ADD CONSTRAINT "config_template_options_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_variants" ADD CONSTRAINT "config_variants_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_grids" ADD CONSTRAINT "config_price_grids_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_grid_axes" ADD CONSTRAINT "config_price_grid_axes_grid_id_fkey" FOREIGN KEY ("grid_id") REFERENCES "config_price_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_grid_axes" ADD CONSTRAINT "config_price_grid_axes_template_option_id_fkey" FOREIGN KEY ("template_option_id") REFERENCES "config_template_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_cells" ADD CONSTRAINT "config_price_cells_grid_id_fkey" FOREIGN KEY ("grid_id") REFERENCES "config_price_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrade_tiers" ADD CONSTRAINT "config_upgrade_tiers_upgrade_id_fkey" FOREIGN KEY ("upgrade_id") REFERENCES "config_upgrades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrade_effects" ADD CONSTRAINT "config_upgrade_effects_upgrade_id_fkey" FOREIGN KEY ("upgrade_id") REFERENCES "config_upgrades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_upgrade_effects" ADD CONSTRAINT "config_upgrade_effects_template_option_id_fkey" FOREIGN KEY ("template_option_id") REFERENCES "config_template_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_template_option_id_fkey" FOREIGN KEY ("template_option_id") REFERENCES "config_template_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-added. Prisma cannot express any of the following.
-- ===========================================================================

-- A shared question (variant_id IS NULL) may be bound to a template once, and
-- a branch question once per variant. One plain UNIQUE cannot say this:
-- Postgres treats every NULL as distinct, so UNIQUE(template_id, variant_id,
-- group_id) would happily accept the same shared question twice.
CREATE UNIQUE INDEX "config_template_options_shared_key"
  ON "config_template_options" ("template_id", "group_id")
  WHERE "variant_id" IS NULL;

CREATE UNIQUE INDEX "config_template_options_variant_key"
  ON "config_template_options" ("template_id", "variant_id", "group_id")
  WHERE "variant_id" IS NOT NULL;

-- A band with neither bound matches every number, which is a silent
-- catch-all that would apply its amount to every door ever quoted.
ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_has_a_bound"
  CHECK (num_nonnulls("min_value", "max_value") >= 1);

-- An inverted band can never match, so it is always an authoring mistake.
ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_bounds_ordered"
  CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "min_value" < "max_value");

-- The catalog importer's guarantee survives `legacy_id` being made nullable:
-- a stock product still cannot exist without its supplier identity.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_needs_legacy_id"
  CHECK ("kind" <> 'stock' OR "legacy_id" IS NOT NULL);

ALTER TABLE "products" ADD CONSTRAINT "products_kind_check"
  CHECK ("kind" IN ('stock', 'made_to_order'));

-- Postgres NUMERIC accepts 'NaN'. An unguarded NaN in a price cell propagates
-- through the whole landed-cost chain and reaches a customer as a blank.
-- x = x is false only for NaN.
ALTER TABLE "config_price_cells" ADD CONSTRAINT "config_price_cells_amount_finite"
  CHECK ("amount" IS NULL OR "amount" = "amount");

ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_amount_finite"
  CHECK ("amount" = "amount");

ALTER TABLE "config_bands" ADD CONSTRAINT "config_bands_amount_finite"
  CHECK ("amount" = "amount");

ALTER TABLE "config_upgrade_tiers" ADD CONSTRAINT "config_upgrade_tiers_amount_finite"
  CHECK ("unit_amount" = "unit_amount");

-- Bounded, code-driven vocabularies. Plain strings rather than a sixth global
-- enum (the customer_email_tokens.purpose precedent), but still constrained at
-- the database rather than trusted from the application.
ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_kind_check"
  CHECK ("kind" IN ('upgrade', 'accessory'));

ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_unit_check"
  CHECK ("unit" IN ('flat', 'per_unit', 'per_set', 'per_sqm', 'per_piece'));

ALTER TABLE "config_upgrade_effects" ADD CONSTRAINT "config_upgrade_effects_kind_check"
  CHECK ("kind" IN ('restrict', 'set', 'note'));

-- A quantity range that cannot be satisfied.
ALTER TABLE "config_upgrades" ADD CONSTRAINT "config_upgrades_qty_ordered"
  CHECK ("max_qty" IS NULL OR "max_qty" >= "min_qty");

-- The sales screen looks a cell up by (grid, key) on every change. The UNIQUE
-- index Prisma generated already serves it; this one covers the editor's
-- "which cells are still empty" sweep over a whole grid.
CREATE INDEX "config_price_cells_grid_idx" ON "config_price_cells" ("grid_id")
  WHERE "amount" IS NOT NULL;
