-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RequestLog" (
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
    "totalCostUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_RequestLog" ("conceptUsed", "createdAt", "errorMessage", "id", "imageModel", "imageProvider", "success", "textModel", "textProvider", "title", "totalCostUsd", "userConcept") SELECT "conceptUsed", "createdAt", "errorMessage", "id", "imageModel", "imageProvider", "success", "textModel", "textProvider", "title", "totalCostUsd", "userConcept" FROM "RequestLog";
DROP TABLE "RequestLog";
ALTER TABLE "new_RequestLog" RENAME TO "RequestLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
