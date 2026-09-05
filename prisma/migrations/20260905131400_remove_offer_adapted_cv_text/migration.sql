/*
  Warnings:

  - You are about to drop the column `adaptedCvGeneratedAt` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `adaptedCvText` on the `Offer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "adaptedCvGeneratedAt",
DROP COLUMN "adaptedCvText";
