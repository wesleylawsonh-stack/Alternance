-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "headline" TEXT,
    "summary" TEXT,
    "linkedin" TEXT,
    "cvFileName" TEXT,
    "cvRawText" TEXT,
    "cvSkills" TEXT,
    "cvSections" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criteria" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "jobTitles" TEXT,
    "locations" TEXT,
    "contractTypes" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "keywords" TEXT,
    "excludeKeywords" TEXT,
    "minSalary" INTEGER,
    "radiusKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "url" TEXT,
    "description" TEXT NOT NULL,
    "contractType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "requiredSkills" TEXT,
    "matchScore" DOUBLE PRECISION,
    "matchedSkills" TEXT,
    "missingSkills" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'NOT_APPLIED',
    "comments" TEXT,
    "adaptedCvText" TEXT,
    "adaptedCvGeneratedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailAccount" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "email" TEXT,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiry" TIMESTAMP(3),
    "historyId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,

    CONSTRAINT "GmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "offerId" TEXT,
    "matchedCompany" TEXT,
    "detectedStatus" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_externalId_key" ON "Offer"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_messageId_key" ON "ProcessedEmail"("messageId");

-- AddForeignKey
ALTER TABLE "ProcessedEmail" ADD CONSTRAINT "ProcessedEmail_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
