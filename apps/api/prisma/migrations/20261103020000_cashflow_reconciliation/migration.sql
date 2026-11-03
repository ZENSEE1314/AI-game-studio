-- CreateEnum
CREATE TYPE "CashFlowActivity" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "cash_flow_activity" "CashFlowActivity",
ADD COLUMN     "is_cash" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "reconciliation_records" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "statement_date" DATE NOT NULL,
    "statement_balance" DECIMAL(18,2) NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "completed_by_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_items" (
    "id" UUID NOT NULL,
    "recon_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_records_account_id_status_statement_date_idx" ON "reconciliation_records"("account_id", "status", "statement_date");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_items_line_id_key" ON "reconciliation_items"("line_id");

-- CreateIndex
CREATE INDEX "reconciliation_items_recon_id_idx" ON "reconciliation_items"("recon_id");

-- AddForeignKey
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_recon_id_fkey" FOREIGN KEY ("recon_id") REFERENCES "reconciliation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "cash_only_assets" CHECK (NOT "is_cash" OR "class" = 'ASSET');
-- Cash flag may not change once the account has posted activity (would rewrite history of the cash flow statement).
CREATE OR REPLACE FUNCTION coa_cash_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.is_cash IS DISTINCT FROM OLD.is_cash AND EXISTS (SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change cash flag of an account that already has journal lines';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER coa_cash_guard_trg BEFORE UPDATE ON "chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION coa_cash_guard();

-- Only one open reconciliation per account.
CREATE UNIQUE INDEX "reconciliation_one_draft_per_account" ON "reconciliation_records"("account_id") WHERE "status" = 'DRAFT';

-- Completed reconciliations are frozen; items can only change while the parent is DRAFT.
CREATE OR REPLACE FUNCTION recon_records_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'completed reconciliations cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'completed reconciliations are immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recon_records_guard_trg BEFORE UPDATE OR DELETE ON "reconciliation_records" FOR EACH ROW EXECUTE FUNCTION recon_records_guard();

CREATE OR REPLACE FUNCTION recon_items_guard() RETURNS trigger AS $$
DECLARE st "ReconStatus"; rid uuid;
BEGIN
  rid := COALESCE(NEW.recon_id, OLD.recon_id);
  SELECT status INTO st FROM reconciliation_records WHERE id = rid;
  IF st IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'items of a completed reconciliation are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recon_items_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON "reconciliation_items" FOR EACH ROW EXECUTE FUNCTION recon_items_guard();
