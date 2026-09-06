-- AlterTable
ALTER TABLE "Criteria" ADD COLUMN     "mandatoryCriteria" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "mandatoryCriteriaMet" BOOLEAN;
