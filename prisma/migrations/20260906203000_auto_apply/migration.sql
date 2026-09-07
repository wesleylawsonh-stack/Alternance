-- AlterTable
ALTER TABLE "Criteria" ADD COLUMN     "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "autoApplyChecked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ApplicationDraft" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "cvVersionId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "applyChannel" TEXT NOT NULL,
    "applyTarget" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDraft_offerId_key" ON "ApplicationDraft"("offerId");

-- AddForeignKey
ALTER TABLE "ApplicationDraft" ADD CONSTRAINT "ApplicationDraft_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
