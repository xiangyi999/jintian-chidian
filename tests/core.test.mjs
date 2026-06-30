import assert from "node:assert/strict";
import test from "node:test";

import {
  createDish,
  filterDishes,
  pickRandomDish,
  buildBackup,
  parseBackup,
  buildRecipePrompt,
  requestAiRecipe,
  hasCloudConfig,
  pushCloudState,
  pullCloudState,
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

test("requestAiRecipe calls DeepSeek chat completions and extracts content", async () => {
  const calls = [];
  const text = await requestAiRecipe({
    apiKey: "deepseek-key",
    model: "deepseek-v4-flash",
    dishName: "番茄鸡蛋饭",
    tags: ["方便下饭"],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "食材建议：番茄、鸡蛋、米饭" } },
          ],
        }),
      };
    },
  });

  assert.equal(text, "食材建议：番茄、鸡蛋、米饭");
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer deepseek-key");
  assert.deepEqual(JSON.parse(calls[0].options.body).messages[0], {
    role: "user",
    content: buildRecipePrompt({ dishName: "番茄鸡蛋饭", tags: ["方便下饭"] }),
  });
});

test("hasCloudConfig requires Supabase url, anon key, and sync space", () => {
  assert.equal(hasCloudConfig({}), false);
  assert.equal(hasCloudConfig({
    cloudUrl: "https://demo.supabase.co",
    cloudAnonKey: "anon",
    syncSpace: "home",
  }), true);
});

test("pushCloudState upserts one shared Supabase row", async () => {
  const calls = [];
  await pushCloudState({
    settings: {
      cloudUrl: "https://demo.supabase.co/",
      cloudAnonKey: "anon",
      syncSpace: "home-menu",
    },
    dishes: [createDish({ name: "A" }, "2026-06-29T12:00:00.000Z")],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({}) };
    },
  });

  assert.equal(calls[0].url, "https://demo.supabase.co/rest/v1/menu_sync?on_conflict=id");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.apikey, "anon");
  assert.match(calls[0].options.headers.Prefer, /resolution=merge-duplicates/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.id, "home-menu");
  assert.equal(body.payload.dishes.length, 1);
  assert.equal(body.payload.settings.cloudAnonKey, "");
});

test("pullCloudState reads the shared Supabase row", async () => {
  const dish = createDish({ name: "云端菜" }, "2026-06-29T12:00:00.000Z");
  const result = await pullCloudState({
    settings: {
      cloudUrl: "https://demo.supabase.co",
      cloudAnonKey: "anon",
      syncSpace: "home-menu",
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://demo.supabase.co/rest/v1/menu_sync?id=eq.home-menu&select=payload,updated_at&limit=1");
      assert.equal(options.headers.Authorization, "Bearer anon");
      return {
        ok: true,
        json: async () => [{ payload: { dishes: [dish], settings: { theme: "cream-dessert" } } }],
      };
    },
  });

  assert.equal(result.dishes[0].name, "云端菜");
  assert.equal(result.settings.theme, "cream-dessert");
});
