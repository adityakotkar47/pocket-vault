-- CreateTable
CREATE TABLE "split" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "split_transactionId_idx" ON "split"("transactionId");

-- CreateIndex
CREATE INDEX "split_userId_idx" ON "split"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "split_transactionId_userId_key" ON "split"("transactionId", "userId");

-- AddForeignKey
ALTER TABLE "split" ADD CONSTRAINT "split_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split" ADD CONSTRAINT "split_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
