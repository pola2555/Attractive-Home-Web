/*
  Warnings:

  - You are about to drop the column `color_hex` on the `config_price_nodes` table. All the data in the column will be lost.
  - You are about to drop the column `color_name` on the `config_price_nodes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "config_price_nodes" DROP COLUMN "color_hex",
DROP COLUMN "color_name";
