-- CreateEnum
CREATE TYPE "TxnType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "type" "TxnType" NOT NULL,
    "balanceAfter" DECIMAL(14,2),
    "category" TEXT,
    "rawText" TEXT NOT NULL,
    "rawHash" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_organizationId_createdAt_id_idx" ON "transaction"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "transaction_userId_idx" ON "transaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_organizationId_rawHash_key" ON "transaction"("organizationId", "rawHash");
