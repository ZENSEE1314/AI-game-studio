-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "data" JSONB;

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

