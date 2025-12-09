-- CreateTable
CREATE TABLE "audit_sessions" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "audit_mode" TEXT NOT NULL,
    "sort_order" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_skus" INTEGER NOT NULL DEFAULT 0,
    "audited_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" SERIAL NOT NULL,
    "audit_session_id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "parent_sku" TEXT,
    "previous_qty" INTEGER NOT NULL,
    "new_qty" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "audited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_custom_order" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "sort_position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_custom_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_thresholds" (
    "id" SERIAL NOT NULL,
    "sku" TEXT,
    "threshold_type" TEXT NOT NULL,
    "threshold_value" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_sessions_warehouse_id_idx" ON "audit_sessions"("warehouse_id");

-- CreateIndex
CREATE INDEX "audit_sessions_status_idx" ON "audit_sessions"("status");

-- CreateIndex
CREATE INDEX "audit_entries_audit_session_id_idx" ON "audit_entries"("audit_session_id");

-- CreateIndex
CREATE INDEX "audit_entries_sku_idx" ON "audit_entries"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "audit_custom_order_warehouse_id_sku_key" ON "audit_custom_order"("warehouse_id", "sku");

-- CreateIndex
CREATE INDEX "audit_custom_order_warehouse_id_sort_position_idx" ON "audit_custom_order"("warehouse_id", "sort_position");

-- CreateIndex
CREATE INDEX "audit_thresholds_sku_idx" ON "audit_thresholds"("sku");

-- AddForeignKey
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_audit_session_id_fkey" FOREIGN KEY ("audit_session_id") REFERENCES "audit_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_custom_order" ADD CONSTRAINT "audit_custom_order_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

