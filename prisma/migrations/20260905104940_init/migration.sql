-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Criteria" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "jobTitles" TEXT,
    "locations" TEXT,
    "contractTypes" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "keywords" TEXT,
    "excludeKeywords" TEXT,
    "minSalary" INTEGER,
    "radiusKm" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "url" TEXT,
    "description" TEXT NOT NULL,
    "contractType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "requiredSkills" TEXT,
    "matchScore" REAL,
    "matchedSkills" TEXT,
    "missingSkills" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'NOT_APPLIED',
    "adaptedCvText" TEXT,
    "adaptedCvGeneratedAt" DATETIME,
    "postedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_externalId_key" ON "Offer"("externalId");
