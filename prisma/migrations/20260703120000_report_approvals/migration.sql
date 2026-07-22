-- CreateEnum
CREATE TYPE "ReportApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ReportApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "status" "ReportApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "numbersGameCount" INTEGER NOT NULL DEFAULT 0,
    "numbersGameDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "evenOddGameCount" INTEGER NOT NULL DEFAULT 0,
    "evenOddGameDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalProfit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportApproval_tenantId_status_createdAt_idx" ON "ReportApproval"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportApproval_tenantId_employeeId_idx" ON "ReportApproval"("tenantId", "employeeId");

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
