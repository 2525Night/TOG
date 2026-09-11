-- CreateTable
CREATE TABLE "ServiceNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "titleHe" TEXT NOT NULL,
    "bodyHe" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "centerTab" TEXT NOT NULL,
    "osEligible" BOOLEAN NOT NULL DEFAULT false,
    "ttlSeconds" INTEGER,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "toastShownAt" TIMESTAMP(3),
    "toastDismissedAt" TIMESTAMP(3),
    "osRequestedAt" TIMESTAMP(3),
    "osDeliveredAt" TIMESTAMP(3),
    "osNotificationId" TEXT,
    "osChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPrefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "saveSuccessToUpdates" BOOLEAN NOT NULL DEFAULT true,
    "roeyNudgesInCenter" BOOLEAN NOT NULL DEFAULT true,
    "osNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "osImportant" BOOLEAN NOT NULL DEFAULT true,
    "osNudge" BOOLEAN NOT NULL DEFAULT true,
    "osWeeklyDigest" BOOLEAN NOT NULL DEFAULT false,
    "osActionErrors" BOOLEAN NOT NULL DEFAULT false,
    "osSuccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceNotification_userId_deletedAt_createdAt_idx" ON "ServiceNotification"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceNotification_userId_centerTab_readAt_idx" ON "ServiceNotification"("userId", "centerTab", "readAt");

-- CreateIndex
CREATE INDEX "ServiceNotification_userId_kind_idx" ON "ServiceNotification"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPrefs_userId_key" ON "NotificationPrefs"("userId");

-- AddForeignKey
ALTER TABLE "ServiceNotification" ADD CONSTRAINT "ServiceNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPrefs" ADD CONSTRAINT "NotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
