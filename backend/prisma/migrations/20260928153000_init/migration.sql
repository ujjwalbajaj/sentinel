-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "org" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "guardianAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchedWallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "firstFundedAt" TIMESTAMP(3),
    "fundingSource" TEXT NOT NULL,
    "fundingTx" TEXT,

    CONSTRAINT "WatchedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "protocolId" TEXT NOT NULL,
    "suspectTxHash" TEXT NOT NULL,
    "attacker" TEXT NOT NULL,
    "attackerContract" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "creRunLog" TEXT NOT NULL DEFAULT '',
    "pauseTxHash" TEXT,
    "strikeTxHash" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "strikeAt" TIMESTAMP(3),
    "valueAtRiskWei" TEXT NOT NULL DEFAULT '0',
    "vaultBalanceWei" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "valueWei" TEXT NOT NULL,
    "riskScore" INTEGER,
    "result" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendLog" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "costWei" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainCursor" (
    "chainId" INTEGER NOT NULL,
    "lastBlock" TEXT NOT NULL,

    CONSTRAINT "ChainCursor_pkey" PRIMARY KEY ("chainId")
);

-- CreateTable
CREATE TABLE "DemoWallet" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Protocol_chainId_vaultAddress_key" ON "Protocol"("chainId", "vaultAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedWallet_address_chainId_key" ON "WatchedWallet"("address", "chainId");

-- CreateIndex
CREATE INDEX "Incident_chainId_status_idx" ON "Incident"("chainId", "status");

-- CreateIndex
CREATE INDEX "Incident_suspectTxHash_idx" ON "Incident"("suspectTxHash");

-- CreateIndex
CREATE INDEX "ActivityEvent_chainId_at_idx" ON "ActivityEvent"("chainId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "DemoWallet_chainId_role_key" ON "DemoWallet"("chainId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- AddForeignKey
ALTER TABLE "Protocol" ADD CONSTRAINT "Protocol_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
