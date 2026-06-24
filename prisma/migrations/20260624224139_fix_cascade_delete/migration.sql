-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertRule_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "WatchlistTicker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AlertRule" ("condition", "createdAt", "enabled", "id", "symbol", "threshold") SELECT "condition", "createdAt", "enabled", "id", "symbol", "threshold" FROM "AlertRule";
DROP TABLE "AlertRule";
ALTER TABLE "new_AlertRule" RENAME TO "AlertRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
