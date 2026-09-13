-- AlterTable
ALTER TABLE "config_addons" ADD COLUMN     "price_unit" TEXT;

-- AlterTable
ALTER TABLE "config_price_nodes" ADD COLUMN     "price_unit" TEXT;

-- CreateTable
CREATE TABLE "config_price_units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_price_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "config_price_units_code_key" ON "config_price_units"("code");
