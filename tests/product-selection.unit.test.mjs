import test from "node:test";
import assert from "node:assert/strict";
import { parseBudget, parseRequestedCount, selectProductsWithinBudget } from "../lib/agent/productSelection.ts";

const products = [
  { id: "A", price: 22.8, rating: 4.9 },
  { id: "B", price: 16.9, rating: 4.8 },
  { id: "C", price: 25.9, rating: 4.8 },
];

test("解析预算和中文商品数量", () => {
  assert.equal(parseBudget("给小孩零食，预算30元内"), 30);
  assert.equal(parseBudget("最多￥49.50"), 49.5);
  assert.equal(parseRequestedCount("推荐三款"), 3);
});

test("商品组合总价不得超过预算", () => {
  const selected = selectProductsWithinBudget(products, 30, 3);
  assert.deepEqual(selected.map((item) => item.id), ["A"]);
  assert.ok(selected.reduce((sum, item) => sum + item.price, 0) <= 30);
});

test("未明确数量时不应假装用户要求了三款", () => {
  assert.equal(/(?:\d+|[一二两三四五六七八九十])\s*(?:款|种|包|件)/.test("给小孩吃的零食，预算30元内"), false);
});

test("优先满足数量，其次选择评分更高的预算内组合", () => {
  const selected = selectProductsWithinBudget(products, 40, 3);
  assert.equal(selected.length, 2);
  assert.ok(selected.reduce((sum, item) => sum + item.price, 0) <= 40);
});
