CREATE TABLE "ReportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReportHistory_createdById_createdAt_idx" ON "ReportHistory"("createdById", "createdAt");
CREATE INDEX "ReportHistory_createdAt_idx" ON "ReportHistory"("createdAt");
