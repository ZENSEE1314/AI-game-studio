-- CreateEnum
CREATE TYPE "AccountClass" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" "AccountClass" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "period_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "reverses_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_approvals" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_class_idx" ON "chart_of_accounts"("class");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_name_key" ON "accounting_periods"("name");

-- CreateIndex
CREATE INDEX "accounting_periods_start_date_end_date_idx" ON "accounting_periods"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reference_key" ON "journal_entries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reverses_id_key" ON "journal_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "journal_entries_status_entry_date_idx" ON "journal_entries"("status", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_period_id_idx" ON "journal_entries"("period_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_entry_id_idx" ON "journal_entry_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines"("account_id");

-- CreateIndex
CREATE INDEX "financial_approvals_entry_id_created_at_idx" ON "financial_approvals"("entry_id", "created_at");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints
ALTER TABLE "accounting_periods" ADD CONSTRAINT "period_dates_ordered" CHECK ("start_date" <= "end_date");
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "line_amounts_valid" CHECK (
  "debit" >= 0 AND "credit" >= 0 AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);
ALTER TABLE "financial_approvals" ADD CONSTRAINT "approval_actions" CHECK ("action" IN ('SUBMIT','APPROVE','REJECT','POST','REVERSE'));

CREATE SEQUENCE journal_ref_seq START 1;

-- Posted books are immutable. Lines can only change while the parent is DRAFT.
CREATE OR REPLACE FUNCTION journal_lines_guard() RETURNS trigger AS $$
DECLARE st "JournalStatus"; eid uuid;
BEGIN
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT status INTO st FROM journal_entries WHERE id = eid;
  IF st IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'journal lines are immutable once the entry leaves DRAFT';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_lines_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON "journal_entry_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_lines_guard();

-- Entries: never deleted; POSTED may only become REVERSED; balanced + >=2 lines to POST.
CREATE OR REPLACE FUNCTION journal_entries_guard() RETURNS trigger AS $$
DECLARE d numeric; c numeric; n int;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'journal entries cannot be deleted; use a reversal'; END IF;
  IF OLD.status IN ('POSTED','REVERSED') THEN
    IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED'
            AND NEW.reference = OLD.reference AND NEW.entry_date = OLD.entry_date
            AND NEW.description = OLD.description AND NEW.period_id = OLD.period_id) THEN
      RAISE EXCEPTION 'posted journal entries are immutable';
    END IF;
  END IF;
  IF NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*) INTO d, c, n FROM journal_entry_lines WHERE entry_id = NEW.id;
    IF n < 2 OR d <> c OR d = 0 THEN RAISE EXCEPTION 'cannot post: entry must have >=2 lines and total debit = total credit'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entries_guard_trg BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entries_guard();

CREATE TRIGGER financial_approvals_append_only BEFORE UPDATE OR DELETE ON "financial_approvals"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
