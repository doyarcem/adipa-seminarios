-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ZoomAuthMode" AS ENUM ('OAUTH_ACCOUNT_LEVEL', 'SERVER_TO_SERVER');

-- CreateEnum
CREATE TYPE "ZoomAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "ParticipantSource" AS ENUM ('ZOOM_DASHBOARD', 'ZOOM_WEBHOOK_ROSTER', 'EXCEL');

-- CreateEnum
CREATE TYPE "ExclusionReason" AS ENUM ('HOST', 'CO_HOST', 'ADIPA_NAME', 'DUPLICATE_NAME', 'INCOMPLETE_NAME', 'DEVICE_NAME', 'PREVIOUS_WINNER', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WinnerStatus" AS ENUM ('PENDING', 'VALIDATED', 'AL_AGUA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "roleLockedByDomain" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ZoomAccount" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "zoomAccountId" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "authMode" "ZoomAuthMode" NOT NULL DEFAULT 'OAUTH_ACCOUNT_LEVEL',
    "status" "ZoomAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "clientIdEnc" TEXT,
    "clientSecretEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT,
    "dashboardApiAvailable" BOOLEAN NOT NULL DEFAULT true,
    "knownCoHostEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "linkedById" TEXT,
    "visibleToOperators" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "zoomAccountId" TEXT NOT NULL,
    "zoomMeetingUuid" TEXT NOT NULL,
    "zoomMeetingId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "hostName" TEXT,
    "hostEmail" TEXT,
    "startTime" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "alternativeHostEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRosterEntry" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "participantUuid" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "zoomUserId" TEXT,
    "email" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "LiveRosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" "ParticipantSource" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalFound" INTEGER NOT NULL,
    "totalEligible" INTEGER NOT NULL,
    "totalExcluded" INTEGER NOT NULL,
    "sourceFileName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capturedById" TEXT,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotParticipant" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "personName" TEXT,
    "zoomParticipantId" TEXT,
    "zoomUserId" TEXT,
    "email" TEXT,
    "device" TEXT,
    "joinTime" TIMESTAMP(3),
    "detectedRole" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "autoEligible" BOOLEAN NOT NULL,
    "autoExclusionReason" "ExclusionReason",
    "manualOverride" BOOLEAN,
    "eligible" BOOLEAN NOT NULL,
    "evaluationTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualOverride" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "previousState" BOOLEAN NOT NULL,
    "newState" BOOLEAN NOT NULL,
    "autoReason" "ExclusionReason",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draw" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requestedWinners" INTEGER NOT NULL,
    "actualWinners" INTEGER NOT NULL,
    "countdownSeconds" INTEGER NOT NULL,
    "poolSize" INTEGER NOT NULL,
    "poolHash" TEXT NOT NULL,
    "status" "DrawStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "operatorId" TEXT,

    CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawWinner" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "winnerName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "WinnerStatus" NOT NULL DEFAULT 'PENDING',
    "replacedByWinnerId" TEXT,
    "alAguaReason" TEXT,
    "alAguaAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "copyVariant" TEXT NOT NULL DEFAULT 'winner',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "meetingId" TEXT,
    "snapshotId" TEXT,
    "drawId" TEXT,
    "zoomAccountId" TEXT,
    "detail" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomAccount_zoomAccountId_key" ON "ZoomAccount"("zoomAccountId");

-- CreateIndex
CREATE INDEX "ZoomAccount_status_idx" ON "ZoomAccount"("status");

-- CreateIndex
CREATE INDEX "Meeting_zoomAccountId_endedAt_idx" ON "Meeting"("zoomAccountId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_zoomAccountId_zoomMeetingUuid_key" ON "Meeting"("zoomAccountId", "zoomMeetingUuid");

-- CreateIndex
CREATE INDEX "LiveRosterEntry_meetingId_leftAt_idx" ON "LiveRosterEntry"("meetingId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveRosterEntry_meetingId_participantUuid_key" ON "LiveRosterEntry"("meetingId", "participantUuid");

-- CreateIndex
CREATE INDEX "Snapshot_meetingId_isActive_idx" ON "Snapshot"("meetingId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_meetingId_sequence_key" ON "Snapshot"("meetingId", "sequence");

-- CreateIndex
CREATE INDEX "SnapshotParticipant_snapshotId_eligible_idx" ON "SnapshotParticipant"("snapshotId", "eligible");

-- CreateIndex
CREATE INDEX "SnapshotParticipant_snapshotId_normalizedName_idx" ON "SnapshotParticipant"("snapshotId", "normalizedName");

-- CreateIndex
CREATE INDEX "ManualOverride_snapshotId_idx" ON "ManualOverride"("snapshotId");

-- CreateIndex
CREATE INDEX "Draw_meetingId_idx" ON "Draw"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "Draw_meetingId_sequence_key" ON "Draw"("meetingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DrawWinner_replacedByWinnerId_key" ON "DrawWinner"("replacedByWinnerId");

-- CreateIndex
CREATE INDEX "DrawWinner_drawId_status_idx" ON "DrawWinner"("drawId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_winnerId_key" ON "Certificate"("winnerId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_meetingId_createdAt_idx" ON "AuditLog"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomAccount" ADD CONSTRAINT "ZoomAccount_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_zoomAccountId_fkey" FOREIGN KEY ("zoomAccountId") REFERENCES "ZoomAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRosterEntry" ADD CONSTRAINT "LiveRosterEntry_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotParticipant" ADD CONSTRAINT "SnapshotParticipant_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawWinner" ADD CONSTRAINT "DrawWinner_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawWinner" ADD CONSTRAINT "DrawWinner_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SnapshotParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawWinner" ADD CONSTRAINT "DrawWinner_replacedByWinnerId_fkey" FOREIGN KEY ("replacedByWinnerId") REFERENCES "DrawWinner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawWinner" ADD CONSTRAINT "DrawWinner_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "DrawWinner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

