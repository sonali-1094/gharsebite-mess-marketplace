-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "menuId" TEXT;

-- CreateIndex
CREATE INDEX "order_items_menuId_idx" ON "order_items"("menuId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
