-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "criteriaNotRespected" TEXT,
ADD COLUMN     "criteriaRespected" TEXT,
ADD COLUMN     "mainReason" TEXT,
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "strengths" TEXT,
ADD COLUMN     "weaknesses" TEXT;
