-- AlterEnum
ALTER TYPE "lead_channel" ADD VALUE 'quote_request';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hs_code_id" UUID,
ADD COLUMN     "template_id" UUID;

-- CreateTable
CREATE TABLE "option_groups" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "input_kind" TEXT NOT NULL,
    "unit" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_group_translations" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "help_text" TEXT,

    CONSTRAINT "option_group_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_values" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "numeric_value" DECIMAL(12,4),
    "attributes" JSONB,
    "color_id" UUID,
    "product_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_value_translations" (
    "id" UUID NOT NULL,
    "value_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "option_value_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_template_options" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "default_value_id" UUID,
    "condition" JSONB,
    "ranges" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_template_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_template_option_values" (
    "template_option_id" UUID NOT NULL,
    "value_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "condition" JSONB,

    CONSTRAINT "config_template_option_values_pkey" PRIMARY KEY ("template_option_id","value_id")
);

-- CreateTable
CREATE TABLE "config_template_constraints" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_template_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_derived_quantities" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "unit" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_derived_quantities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "template_id" UUID,
    "product_id" UUID,
    "code" TEXT NOT NULL,
    "condition" JSONB,
    "stage" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "basis" TEXT NOT NULL,
    "quantity_code" TEXT,
    "apply_per" TEXT NOT NULL DEFAULT 'unit',
    "amount" DECIMAL(12,2),
    "rate" DECIMAL(12,4),
    "currency" CHAR(3),
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hs_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "description" TEXT NOT NULL,
    "duty_percent" DECIMAL(6,3) NOT NULL DEFAULT 5,
    "vat_percent" DECIMAL(6,3) NOT NULL DEFAULT 5,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hs_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_rates" (
    "id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "origin_port" VARCHAR(10) NOT NULL,
    "destination_port" VARCHAR(10) NOT NULL,
    "container_type" TEXT,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "rate_low" DECIMAL(12,2),
    "rate_high" DECIMAL(12,2),
    "min_charge" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "transit_days" INTEGER,
    "volumetric_divisor" INTEGER,
    "packaging_factor" DECIMAL(6,3) NOT NULL DEFAULT 1.10,
    "valid_from" DATE,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "freight_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_storage_rates" (
    "id" UUID NOT NULL,
    "port" VARCHAR(10) NOT NULL,
    "container_type" TEXT,
    "free_days" INTEGER NOT NULL DEFAULT 5,
    "per_day_rate" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "port_storage_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lead_id" UUID,
    "customer_id" UUID,
    "created_by" UUID,
    "assigned_to" UUID,
    "quote_currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "fx_rates" JSONB,
    "fx_rates_at" TIMESTAMPTZ(6),
    "contingency_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "title" TEXT,
    "notes" TEXT,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "product_id" UUID,
    "template_id" UUID,
    "hs_code_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "name_snapshot" TEXT NOT NULL,
    "code_snapshot" TEXT,
    "selection" JSONB NOT NULL,
    "selection_label" TEXT,
    "derived" JSONB,
    "unit_cost" DECIMAL(12,2),
    "cost_currency" CHAR(3),
    "landed_unit_cost" DECIMAL(12,2),
    "price_breakdown" JSONB,
    "priced_at" TIMESTAMPTZ(6),
    "pricing_inputs_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'sea_lcl',
    "origin_port" VARCHAR(10) NOT NULL DEFAULT 'CNSHA',
    "destination_port" VARCHAR(10) NOT NULL DEFAULT 'AEJEA',
    "incoterm" TEXT NOT NULL DEFAULT 'FOB',
    "container_type" TEXT,
    "container_count" INTEGER,
    "volume_cbm" DECIMAL(12,3),
    "gross_weight_kg" DECIMAL(12,3),
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "estimated_transit_days" INTEGER,
    "expected_storage_days" INTEGER NOT NULL DEFAULT 0,
    "etd" DATE,
    "eta" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_components" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "provider_code" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_low" DECIMAL(12,2),
    "amount_high" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "in_customs_base" BOOLEAN NOT NULL DEFAULT false,
    "is_recoverable" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "basis" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cost_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "option_groups_code_key" ON "option_groups"("code");

-- CreateIndex
CREATE INDEX "option_group_translations_locale_code_idx" ON "option_group_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "option_group_translations_group_id_locale_code_key" ON "option_group_translations"("group_id", "locale_code");

-- CreateIndex
CREATE INDEX "option_values_color_id_idx" ON "option_values"("color_id");

-- CreateIndex
CREATE INDEX "option_values_product_id_idx" ON "option_values"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_values_group_id_code_key" ON "option_values"("group_id", "code");

-- CreateIndex
CREATE INDEX "option_value_translations_locale_code_idx" ON "option_value_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "option_value_translations_value_id_locale_code_key" ON "option_value_translations"("value_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "config_templates_code_key" ON "config_templates"("code");

-- CreateIndex
CREATE INDEX "config_template_options_template_id_sort_order_idx" ON "config_template_options"("template_id", "sort_order");

-- CreateIndex
CREATE INDEX "config_template_options_group_id_idx" ON "config_template_options"("group_id");

-- CreateIndex
CREATE INDEX "config_template_options_default_value_id_idx" ON "config_template_options"("default_value_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_template_options_template_id_group_id_key" ON "config_template_options"("template_id", "group_id");

-- CreateIndex
CREATE INDEX "config_template_option_values_value_id_idx" ON "config_template_option_values"("value_id");

-- CreateIndex
CREATE INDEX "config_template_constraints_template_id_idx" ON "config_template_constraints"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_template_constraints_template_id_code_key" ON "config_template_constraints"("template_id", "code");

-- CreateIndex
CREATE INDEX "config_derived_quantities_template_id_sort_order_idx" ON "config_derived_quantities"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "config_derived_quantities_template_id_code_key" ON "config_derived_quantities"("template_id", "code");

-- CreateIndex
CREATE INDEX "pricing_rules_template_id_stage_priority_idx" ON "pricing_rules"("template_id", "stage", "priority");

-- CreateIndex
CREATE INDEX "pricing_rules_product_id_stage_priority_idx" ON "pricing_rules"("product_id", "stage", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "hs_codes_code_key" ON "hs_codes"("code");

-- CreateIndex
CREATE INDEX "freight_rates_mode_origin_port_destination_port_is_active_idx" ON "freight_rates"("mode", "origin_port", "destination_port", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "port_storage_rates_port_container_type_key" ON "port_storage_rates"("port", "container_type");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_reference_key" ON "quotes"("reference");

-- CreateIndex
CREATE INDEX "quotes_status_created_at_idx" ON "quotes"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quotes_assigned_to_idx" ON "quotes"("assigned_to");

-- CreateIndex
CREATE INDEX "quotes_lead_id_idx" ON "quotes"("lead_id");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_sort_order_idx" ON "quote_items"("quote_id", "sort_order");

-- CreateIndex
CREATE INDEX "quote_items_product_id_idx" ON "quote_items"("product_id");

-- CreateIndex
CREATE INDEX "quote_items_template_id_idx" ON "quote_items"("template_id");

-- CreateIndex
CREATE INDEX "quote_items_hs_code_id_idx" ON "quote_items"("hs_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_quote_id_key" ON "shipments"("quote_id");

-- CreateIndex
CREATE INDEX "cost_components_shipment_id_sort_order_idx" ON "cost_components"("shipment_id", "sort_order");

-- CreateIndex
CREATE INDEX "products_template_id_idx" ON "products"("template_id");

-- CreateIndex
CREATE INDEX "products_hs_code_id_idx" ON "products"("hs_code_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_hs_code_id_fkey" FOREIGN KEY ("hs_code_id") REFERENCES "hs_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group_translations" ADD CONSTRAINT "option_group_translations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group_translations" ADD CONSTRAINT "option_group_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_values" ADD CONSTRAINT "option_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_translations" ADD CONSTRAINT "option_value_translations_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_translations" ADD CONSTRAINT "option_value_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_options" ADD CONSTRAINT "config_template_options_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_options" ADD CONSTRAINT "config_template_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_options" ADD CONSTRAINT "config_template_options_default_value_id_fkey" FOREIGN KEY ("default_value_id") REFERENCES "option_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_option_values" ADD CONSTRAINT "config_template_option_values_template_option_id_fkey" FOREIGN KEY ("template_option_id") REFERENCES "config_template_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_option_values" ADD CONSTRAINT "config_template_option_values_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_template_constraints" ADD CONSTRAINT "config_template_constraints_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_derived_quantities" ADD CONSTRAINT "config_derived_quantities_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "config_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_hs_code_id_fkey" FOREIGN KEY ("hs_code_id") REFERENCES "hs_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_components" ADD CONSTRAINT "cost_components_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added SQL (docs/DATABASE.md §9) — Prisma cannot express any of this.
-- ---------------------------------------------------------------------------

-- A pricing rule is scoped to EXACTLY ONE of a template or a product. Prisma
-- has no XOR, so without this constraint a row with both set silently applies
-- twice and quietly doubles a charge.
ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_scope_check"
  CHECK (num_nonnulls("template_id", "product_id") = 1);

-- Quote references ('Q-2026-0001') come from a sequence, not MAX(reference)+1,
-- which races the moment two people create a quote at the same second and then
-- fails on the UNIQUE index.
CREATE SEQUENCE IF NOT EXISTS "quote_reference_seq" AS BIGINT START WITH 1 INCREMENT BY 1;

-- Percentages are bounded. A -5% duty rate or a 900% VAT rate is a typo, and
-- catching it at the column is cheaper than discovering it in a customer quote.
ALTER TABLE "hs_codes"
  ADD CONSTRAINT "hs_codes_duty_percent_check" CHECK ("duty_percent" >= 0 AND "duty_percent" <= 100),
  ADD CONSTRAINT "hs_codes_vat_percent_check"  CHECK ("vat_percent"  >= 0 AND "vat_percent"  <= 100);

-- Postgres NUMERIC accepts 'NaN' and '±Infinity'. A bad derived-quantity
-- formula must never be able to persist one into a money column, where it
-- would poison every downstream sum silently rather than erroring.
ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_unit_cost_finite" CHECK ("unit_cost" IS NULL OR "unit_cost" = "unit_cost"),
  ADD CONSTRAINT "quote_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "cost_components"
  ADD CONSTRAINT "cost_components_amount_finite" CHECK ("amount" = "amount");
