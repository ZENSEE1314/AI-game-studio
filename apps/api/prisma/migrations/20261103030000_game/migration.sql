-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('GRANT', 'HOLD', 'RELEASE');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'RESULT_PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "held" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_ledger" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "held_after" BIGINT NOT NULL,
    "ref" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'DRAFT',
    "min_stake" BIGINT NOT NULL DEFAULT 10000,
    "pending_number" INTEGER,
    "created_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_selections" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "stake" BIGINT NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_results" (
    "round_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "published_by" UUID NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_results_pkey" PRIMARY KEY ("round_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_idempotency_key_key" ON "wallet_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_ledger_wallet_id_created_at_idx" ON "wallet_ledger"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "game_rounds_status_created_at_idx" ON "game_rounds"("status", "created_at");

-- CreateIndex
CREATE INDEX "number_selections_user_id_idx" ON "number_selections"("user_id");

-- CreateIndex
CREATE INDEX "number_selections_round_id_number_idx" ON "number_selections"("round_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "number_selections_round_id_user_id_number_key" ON "number_selections"("round_id", "user_id", "number");

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_selections" ADD CONSTRAINT "number_selections_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- No negative balances, ever.
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_nonneg" CHECK ("balance" >= 0 AND "held" >= 0);
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "ledger_amount_pos" CHECK ("amount" > 0 AND "balance_after" >= 0 AND "held_after" >= 0);
ALTER TABLE "number_selections" ADD CONSTRAINT "selection_number_range" CHECK ("number" BETWEEN 1 AND 27);
ALTER TABLE "number_selections" ADD CONSTRAINT "selection_stake_pos" CHECK ("stake" > 0);
ALTER TABLE "game_rounds" ADD CONSTRAINT "round_min_stake_pos" CHECK ("min_stake" > 0);
ALTER TABLE "game_rounds" ADD CONSTRAINT "round_pending_range" CHECK ("pending_number" IS NULL OR "pending_number" BETWEEN 1 AND 27);
ALTER TABLE "round_results" ADD CONSTRAINT "result_number_range" CHECK ("number" BETWEEN 1 AND 27);

-- Ledger and published results are append-only.
CREATE TRIGGER wallet_ledger_append_only BEFORE UPDATE OR DELETE ON "wallet_ledger" FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER round_results_immutable BEFORE UPDATE OR DELETE ON "round_results" FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Selections can only be inserted/deleted while the round is OPEN; afterwards only the `released` flag may change.
CREATE OR REPLACE FUNCTION selections_guard() RETURNS trigger AS $$
DECLARE st "RoundStatus"; rid uuid;
BEGIN
  rid := COALESCE(NEW.round_id, OLD.round_id);
  SELECT status INTO st FROM game_rounds WHERE id = rid;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.number <> OLD.number OR NEW.stake <> OLD.stake OR NEW.user_id <> OLD.user_id OR NEW.round_id <> OLD.round_id THEN
      RAISE EXCEPTION 'selections are immutable; only release is allowed';
    END IF;
    RETURN NEW;
  END IF;
  IF st IS DISTINCT FROM 'OPEN' THEN RAISE EXCEPTION 'selections can only change while the round is OPEN'; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER selections_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON "number_selections" FOR EACH ROW EXECUTE FUNCTION selections_guard();

-- Legal round state machine; COMPLETED/CANCELLED are terminal.
CREATE OR REPLACE FUNCTION rounds_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'rounds cannot be deleted'; END IF;
  IF OLD.status IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'round is final'; END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status='DRAFT' AND NEW.status IN ('OPEN','CANCELLED')) OR
       (OLD.status='OPEN' AND NEW.status IN ('LOCKED','CANCELLED')) OR
       (OLD.status='LOCKED' AND NEW.status IN ('RESULT_PENDING','CANCELLED')) OR
       (OLD.status='RESULT_PENDING' AND NEW.status IN ('COMPLETED','LOCKED','CANCELLED'))) THEN
    RAISE EXCEPTION 'illegal round transition % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM round_results WHERE round_id = NEW.id) THEN
    RAISE EXCEPTION 'cannot complete a round without a published result';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER rounds_guard_trg BEFORE UPDATE OR DELETE ON "game_rounds" FOR EACH ROW EXECUTE FUNCTION rounds_guard();
