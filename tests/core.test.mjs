import assert from "node:assert/strict";
import test from "node:test";

import {
  createDish,
  filterDishes,
  pickRandomDish,
  buildBackup,
  parseBackup,
  buildRecipePrompt,
} from "../src/core.js";

test("createDish normalizes dish fields and timestamps", () => {
  const dish = createDish({
    name: "  番茄鸡蛋饭  ",
    recipe: "拌饭很好吃",
    tags: [" 下饭 ", "快手", "下饭", ""],
    image: "data:image/png;base64,abc",
    favorite: true,
  }, "2026-06-29T12:00:00.000Z");

  assert.equal(dish.name, "番茄鸡蛋饭");
  assert.deepEqual(dish.tags, ["下饭", "快手"]);
  assert.equal(dish.favorite, true);
  assert.equal(dish.createdAt, "2026-06-29T12:00:00.000Z");
  assert.equal(dish.updatedAt, "2026-06-29T12:00:00.000Z");
  assert.match(dish.id, /^dish-/);
});

test("filterDishes supports search, favorite, and all selected tags", () => {
  const dishes = [
    createDish({ name: "凉拌鸡丝面", tags: ["凉爽的", "快手"], favorite: true }, "2026-06-29T12:00:00.000Z"),
    createDish({ name: "番茄鸡蛋饭", tags: ["方便下饭"], favorite: false }, "2026-06-29T12:00:00.000Z"),
    createDish({ name: "绿豆汤", tags: ["凉爽的", "想吃甜的"], favorite: true }, "2026-06-29T12:00:00.000Z"),
  ];

  const result = filterDishes(dishes, {
    query: "凉",
    tags: ["凉爽的"],
    favoriteOnly: true,
  });

  assert.deepEqual(result.map((dish) => dish.name), ["凉拌鸡丝面"]);
});

test("pickRandomDish returns null for empty candidates and accepts deterministic random", () => {
  assert.equal(pickRandomDish([], () => 0.5), null);

  const dishes = [
    createDish({ name: "A", tags: ["快手"] }, "2026-06-29T12:00:00.000Z"),
    createDish({ name: "B", tags: ["快手"] }, "2026-06-29T12:00:00.000Z"),
    createDish({ name: "C", tags: ["下饭"] }, "2026-06-29T12:00:00.000Z"),
  ];

  const picked = pickRandomDish(dishes, () => 0.74, { tags: ["快手"] });
  assert.equal(picked.name, "B");
});

test("backup roundtrip preserves dishes and excludes api key", () => {
  const dishes = [
    createDish({ name: "番茄鸡蛋饭", tags: ["下饭"], favorite: true }, "2026-06-29T12:00:00.000Z"),
  ];
  const backup = buildBackup({
    dishes,
    settings: {
      apiKey: "secret-key",
      aiProvider: "openai",
      defaultRandomScope: "all",
      theme: "cream-dessert",
    },
  }, "2026-06-29T12:00:00.000Z");

  assert.equal(backup.settings.apiKey, "");

  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.dishes.length, 1);
  assert.equal(parsed.dishes[0].name, "番茄鸡蛋饭");
  assert.equal(parsed.settings.theme, "cream-dessert");
});

test("parseBackup rejects invalid backup without returning partial data", () => {
  assert.throws(
    () => parseBackup(JSON.stringify({ version: 999, dishes: "bad" })),
    /备份文件格式不正确/
  );
});

test("buildRecipePrompt includes dish name and selected tags", () => {
  const prompt = buildRecipePrompt({
    dishName: "凉拌鸡丝面",
    tags: ["凉爽的", "方便下饭"],
  });

  assert.match(prompt, /凉拌鸡丝面/);
  assert.match(prompt, /凉爽的、方便下饭/);
  assert.match(prompt, /简短做法/);
});
