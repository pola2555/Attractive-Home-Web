-- CreateTable
CREATE TABLE "config_price_nodes" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "parent_id" UUID,
    "group_id" UUID NOT NULL,
    "value_id" UUID NOT NULL,
    "amount" DECIMAL(12,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "config_price_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_price_nodes_variant_id_idx" ON "config_price_nodes"("variant_id");

-- CreateIndex
CREATE INDEX "config_price_nodes_parent_id_idx" ON "config_price_nodes"("parent_id");

-- AddForeignKey
ALTER TABLE "config_price_nodes" ADD CONSTRAINT "config_price_nodes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "config_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_nodes" ADD CONSTRAINT "config_price_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "config_price_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_nodes" ADD CONSTRAINT "config_price_nodes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_price_nodes" ADD CONSTRAINT "config_price_nodes_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "option_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
