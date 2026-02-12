-- CreateTable
CREATE TABLE "RequestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "userConcept" TEXT,
    "conceptUsed" TEXT,
    "textProvider" TEXT NOT NULL,
    "textModel" TEXT NOT NULL,
    "imageProvider" TEXT NOT NULL,
    "imageModel" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "totalCostUsd" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "RequestCostLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "imageSize" INTEGER,
    "imageCount" INTEGER,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestCostLineItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RequestLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RequestCostLineItem_requestId_idx" ON "RequestCostLineItem"("requestId");

-- CreateIndex
CREATE INDEX "RequestCostLineItem_createdAt_idx" ON "RequestCostLineItem"("createdAt");
