-- CreateTable
CREATE TABLE "User" (
    "id" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "userId" BIGINT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'idle',
    "fromAsset" TEXT,
    "toAsset" TEXT,
    "amount" DECIMAL(36,18),
    "payoutAddr" TEXT,
    "payoutExtra" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "fromAsset" TEXT NOT NULL,
    "toAsset" TEXT NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "expectedAmount" DECIMAL(36,18),
    "payoutAddress" TEXT NOT NULL,
    "payoutExtraId" TEXT,
    "payinAddress" TEXT NOT NULL,
    "payinExtraId" TEXT,
    "status" TEXT NOT NULL,
    "payoutHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exchange_userId_createdAt_idx" ON "Exchange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Exchange_status_idx" ON "Exchange"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
