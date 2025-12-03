import { prisma } from './lib/prisma';

async function deleteBadOrders() {
  // Get the bad order IDs
  const badOrderIds = await prisma.$queryRaw<{id: string}[]>`
    SELECT id FROM orders WHERE sales_channel IS NULL
  `;
  console.log(`Found ${badOrderIds.length} bad orders to delete`);

  // Delete returns for these orders
  const deletedReturns = await prisma.$executeRaw`
    DELETE FROM returns
    WHERE order_id IN (
      SELECT id FROM orders WHERE sales_channel IS NULL
    )
  `;
  console.log(`Deleted ${deletedReturns} returns`);

  // Delete order items for these orders
  const deletedItems = await prisma.$executeRaw`
    DELETE FROM order_items
    WHERE order_id IN (
      SELECT id FROM orders WHERE sales_channel IS NULL
    )
  `;
  console.log(`Deleted ${deletedItems} order items`);

  // Delete the bad orders
  const deletedOrders = await prisma.$executeRaw`
    DELETE FROM orders
    WHERE sales_channel IS NULL
  `;
  console.log(`Deleted ${deletedOrders} bad orders`);

  await prisma.$disconnect();
}

deleteBadOrders();