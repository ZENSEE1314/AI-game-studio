-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referral_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");


-- Existing staff get a code. Unambiguous alphabet (no 0/O/1/I/L), 8 characters.
UPDATE "users" u SET "referral_code" = (
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  FROM generate_series(1, 8) WHERE u.id = u.id
) WHERE "role" = 'STAFF' AND "referral_code" IS NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_referral_only_staff" CHECK ("referral_code" IS NULL OR "role" = 'STAFF');
