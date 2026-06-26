-- CreateTable
CREATE TABLE "Simulation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "shares" REAL NOT NULL,
    "entryPrice" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "gainLossPct" REAL NOT NULL,
    "cagr" REAL NOT NULL,
    "daysHeld" INTEGER NOT NULL,
    "alpha" REAL NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
