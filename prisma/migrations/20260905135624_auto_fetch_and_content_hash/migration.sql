-- AlterTable
ALTER TABLE "Criteria" ADD COLUMN     "autoFetchEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "contentHash" TEXT;
