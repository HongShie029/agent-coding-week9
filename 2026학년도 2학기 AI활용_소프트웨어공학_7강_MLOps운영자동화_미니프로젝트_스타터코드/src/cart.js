// Mission 1 — 장바구니 (SRS: FR-CART-01, FR-CART-02 / US-05, US-06)
const { AppError } = require("./errors");

const MAX_QTY = 99;

function cartOf(ctx, userId) {
  if (!ctx.store.carts.has(userId)) ctx.store.carts.set(userId, new Map());
  return ctx.store.carts.get(userId);
}

function assertQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    throw new AppError("INVALID_QUANTITY", `수량은 1~${MAX_QTY} 사이의 정수여야 합니다`, { quantity });
  }
}

function findSellable(ctx, productId) {
  const product = ctx.store.products.get(productId);
  if (!product || product.status !== "ON_SALE") {
    throw new AppError("NOT_FOUND", "상품을 찾을 수 없습니다", { productId });
  }
  return product;
}

function addToCart(ctx, userId, productId, quantity) {
  assertQuantity(quantity);
  const product = findSellable(ctx, productId);
  const cart = cartOf(ctx, userId);
  const current = cart.get(productId) ?? 0;
  if (current + quantity > product.stock) {
    throw new AppError("OUT_OF_STOCK", "재고가 부족합니다", { maxAddable: Math.max(0, product.stock - current) });
  }
  cart.set(productId, current + quantity);
  return getCart(ctx, userId);
}

function changeQuantity(ctx, userId, productId, quantity) {
  assertQuantity(quantity);
  const cart = cartOf(ctx, userId);
  if (!cart.has(productId)) throw new AppError("NOT_FOUND", "장바구니에 없는 상품입니다", { productId });
  const product = findSellable(ctx, productId);
  if (quantity > product.stock) {
    throw new AppError("OUT_OF_STOCK", "재고가 부족합니다", { maxAddable: product.stock });
  }
  cart.set(productId, quantity);
  return getCart(ctx, userId);
}

function removeItem(ctx, userId, productId) {
  const cart = cartOf(ctx, userId);
  if (!cart.has(productId)) throw new AppError("NOT_FOUND", "장바구니에 없는 상품입니다", { productId });
  cart.delete(productId);
  return getCart(ctx, userId);
}

function getCart(ctx, userId) {
  const cart = cartOf(ctx, userId);
  const items = [];
  for (const [productId, quantity] of cart) {
    const p = ctx.store.products.get(productId);
    if (!p) continue;
    items.push({ productId, name: p.name, unitPrice: p.price, quantity, lineTotal: p.price * quantity });
  }
  const totalAmount = items.reduce((sum, i) => sum + i.lineTotal, 0);
  return { userId, items, totalAmount };
}

module.exports = { addToCart, changeQuantity, removeItem, getCart, MAX_QTY };
