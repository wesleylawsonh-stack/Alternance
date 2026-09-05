-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "cvFileUrl" TEXT;

-- CreateTable
CREATE TABLE "CvVersion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL DEFAULT 'singleton',
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "offerId" TEXT,
    "offerTitle" TEXT,
    "offerCompany" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvVersion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CvVersion" ADD CONSTRAINT "CvVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
