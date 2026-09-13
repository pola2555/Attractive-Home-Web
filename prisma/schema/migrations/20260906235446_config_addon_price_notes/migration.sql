-- AlterTable
ALTER TABLE "config_addons" ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "configuration" TEXT,
ADD COLUMN     "description" TEXT;
