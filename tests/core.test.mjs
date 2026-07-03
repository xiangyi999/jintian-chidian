import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  createDish,
  filterDishes,
  pickRandomDish,
  buildBackup,
  buildCloudPayload,
  buildStorageImagePath,
  parseBackup,
  buildRecipePrompt,
  buildShoppingList,
  normalizeSettings,
  copyShoppingListText,
  createEmptyShoppingState,
  createEmptyWeeklyPlan,
  clearWeeklyMeal,
  parseRecipeDetails,
  parseIngredientItem,
  requestAiRecipe,
  hasCloudConfig,
  friendlyErrorMessage,
  friendlyUploadError,
  getStoragePublicUrl,
  isCloudImageUrl,
  isStorageQuotaError,
  setWeeklyMeal,
  pushCloudState,
  pullCloudState,
  uploadDishImage,
  } from "../src/core.js";

test("storage quota errors are recognized and wrapped in friendly Chinese", () => {
  const domQuotaError = new DOMException("The quota has been exceeded.", "QuotaExceededError");
  const storageSetItemError = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'jintian-chidian-state-v1' exceeded the quota.");

  assert.equal(isStorageQuotaError(domQuotaError), true);
  assert.equal(isStorageQuotaError(storageSetItemError), true);
  assert.equal(isStorageQuotaError(new Error("Network request failed")), false);
  assert.equal(
    friendlyErrorMessage(storageSetItemError),
    "图片太大，本机存储空间不够。请换一张小图，或稍后使用云端图片库。"
  );
});

test("storage image paths stay inside the sync space", () => {
  const path = buildStorageImagePath(
    { syncSpace: " home menu/2026 " },
    "dish:tomato/noodle",
    "2026-07-03T04:05:06.789Z"
  );

  assert.equal(path, "home-menu-2026/dish-tomato-noodle-20260703T040506789Z.jpg");
});

test("public storage URLs are generated for Supabase bucket images", () => {
  const imagePath = "home-menu-2026/dish-1-20260703T040506789Z.jpg";
  const publicUrl = getStoragePublicUrl(DEFAULT_SETTINGS, "dish-images", imagePath);

  assert.equal(
    publicUrl,
    "https://kchquzndyxfaldfxyzfn.supabase.co/storage/v1/object/public/dish-images/home-menu-2026/dish-1-20260703T040506789Z.jpg"
  );
  assert.equal(isCloudImageUrl(publicUrl), true);
  assert.equal(isCloudImageUrl("data:image/jpeg;base64,abc"), false);
});

test("uploadDishImage uploads data URL images and returns the public URL", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ Key: "dish-images/home-menu-2026/dish-1.jpg" }) };
  };

  const result = await uploadDishImage({
    settings: DEFAULT_SETTINGS,
    dishId: "dish-1",
    dataUrl: "data:image/jpeg;base64,aGVsbG8=",
    timestamp: "2026-07-03T04:05:06.789Z",
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://kchquzndyxfaldfxyzfn.supabase.co/storage/v1/object/dish-images/home-menu-2026/dish-1-20260703T040506789Z.jpg"
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "image/jpeg");
  assert.equal(calls[0].options.headers["x-upsert"], "true");
  assert.equal(result.imagePath, "home-menu-2026/dish-1-20260703T040506789Z.jpg");
  assert.equal(isCloudImageUrl(result.image), true);
});

test("storage upload failures are wrapped in friendly Chinese", async () => {
  await assert.rejects(
    () => uploadDishImage({
      settings: DEFAULT_SETTINGS,
      dishId: "dish-1",
      dataUrl: "data:image/jpeg;base64,aGVsbG8=",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    /图片上传失败/
  );
  assert.equal(
    friendlyUploadError(new Error("storage policy denied")).message,
    "图片上传失败，请检查网络或 Supabase 图片库设置。"
  );
});

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
  const weeklyPlan = setWeeklyMeal(createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00")), "mon", "lunch", dishes[0].id);
  const backup = buildBackup({
    dishes,
    weeklyPlan,
    shoppingState: {
      checked: { "auto:番茄:个": true },
      overrides: {},
      customItems: [{ id: "custom-1", name: "盐", quantity: "适量", category: "调料辅料", checked: false }],
    },
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
  assert.equal(parsed.weeklyPlan.slots.mon.lunch, dishes[0].id);
  assert.equal(parsed.shoppingState.customItems[0].name, "盐");
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

test("parseRecipeDetails extracts ingredients, steps, and tips from recipe text", () => {
  const details = parseRecipeDetails(`
食材：鸡蛋、番茄、米饭
步骤：
1. 番茄炒出汁。
2. 倒入鸡蛋块，盖在米饭上。
小贴士：喜欢酸甜可以多加一点番茄。
  `);

  assert.deepEqual(details.ingredients, ["鸡蛋", "番茄", "米饭"]);
  assert.deepEqual(details.steps, ["番茄炒出汁。", "倒入鸡蛋块，盖在米饭上。"]);
  assert.equal(details.tips, "喜欢酸甜可以多加一点番茄。");
});

test("parseRecipeDetails falls back to readable steps for plain recipe text", () => {
  const details = parseRecipeDetails("先焯水。再拌酱汁。最后撒芝麻。");

  assert.equal(details.ingredients.length, 0);
  assert.deepEqual(details.steps, ["先焯水。", "再拌酱汁。", "最后撒芝麻。"]);
});

test("createEmptyWeeklyPlan creates current week with seven days and three meals", () => {
  const plan = createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00"));

  assert.equal(plan.weekId, "2026-W27");
  assert.deepEqual(Object.keys(plan.slots), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  assert.deepEqual(plan.slots.mon, { breakfast: "", lunch: "", dinner: "" });
  assert.deepEqual(plan.slots.sun, { breakfast: "", lunch: "", dinner: "" });
});

test("setWeeklyMeal and clearWeeklyMeal update a single meal slot immutably", () => {
  const plan = createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00"));
  const planned = setWeeklyMeal(plan, "wed", "dinner", "dish-1");
  const cleared = clearWeeklyMeal(planned, "wed", "dinner");

  assert.equal(plan.slots.wed.dinner, "");
  assert.equal(planned.slots.wed.dinner, "dish-1");
  assert.equal(cleared.slots.wed.dinner, "");
});

test("parseIngredientItem extracts name quantity unit and category", () => {
  assert.deepEqual(parseIngredientItem("番茄 2个"), {
    name: "番茄",
    quantity: 2,
    unit: "个",
    quantityText: "2个",
    category: "蔬菜类",
  });
  assert.equal(parseIngredientItem("生抽 适量").category, "调料辅料");
});

test("buildShoppingList merges repeated ingredients and keeps incompatible quantities readable", () => {
  const dishes = [
    createDish({ id: "dish-a", name: "番茄饭", recipe: "食材：番茄 2个、鸡蛋 3个、米饭 1碗、生抽 适量" }, "2026-07-02T00:00:00.000Z"),
    createDish({ id: "dish-b", name: "炒蛋", recipe: "食材：番茄 1个、鸡蛋 2个、生抽 1勺" }, "2026-07-02T00:00:00.000Z"),
  ];
  const plan = setWeeklyMeal(
    setWeeklyMeal(createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00")), "mon", "lunch", "dish-a"),
    "tue",
    "dinner",
    "dish-b"
  );
  const list = buildShoppingList({ weeklyPlan: plan, dishes, shoppingState: createEmptyShoppingState() });

  const vegetables = list.find((group) => group.category === "蔬菜类").items;
  const proteins = list.find((group) => group.category === "肉蛋禽类").items;
  const seasoning = list.find((group) => group.category === "调料辅料").items;

  assert.equal(vegetables.find((item) => item.name === "番茄").quantityText, "3个");
  assert.equal(proteins.find((item) => item.name === "鸡蛋").quantityText, "5个");
  assert.equal(seasoning.find((item) => item.name === "生抽").quantityText, "适量、1勺");
});

test("buildShoppingList applies checked state, overrides, and custom items", () => {
  const dishes = [
    createDish({ id: "dish-a", name: "番茄饭", recipe: "食材：番茄 2个、鸡蛋 3个" }, "2026-07-02T00:00:00.000Z"),
  ];
  const plan = setWeeklyMeal(createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00")), "mon", "lunch", "dish-a");
  const shoppingState = {
    checked: { "auto:番茄:个": true },
    overrides: { "auto:鸡蛋:个": { name: "土鸡蛋", quantity: "6个", category: "肉蛋禽类" } },
    customItems: [{ id: "custom-1", name: "葱姜", quantity: "适量", category: "调料辅料", checked: true }],
  };
  const list = buildShoppingList({ weeklyPlan: plan, dishes, shoppingState });

  const tomato = list.flatMap((group) => group.items).find((item) => item.name === "番茄");
  const egg = list.flatMap((group) => group.items).find((item) => item.name === "土鸡蛋");
  const custom = list.flatMap((group) => group.items).find((item) => item.name === "葱姜");

  assert.equal(tomato.checked, true);
  assert.equal(egg.quantityText, "6个");
  assert.equal(custom.checked, true);
});

test("copyShoppingListText returns grouped plain text", () => {
  const text = copyShoppingListText([
    { category: "蔬菜类", items: [{ name: "番茄", quantityText: "3个", checked: false }] },
    { category: "肉蛋禽类", items: [{ name: "鸡蛋", quantityText: "5个", checked: true }] },
  ]);

  assert.match(text, /蔬菜类/);
  assert.match(text, /☐ 番茄 3个/);
  assert.match(text, /☑ 鸡蛋 5个/);
});

test("buildCloudPayload includes weekly plan and shopping state", () => {
  const weeklyPlan = setWeeklyMeal(createEmptyWeeklyPlan(new Date("2026-07-02T12:00:00+08:00")), "fri", "dinner", "dish-1");
  const payload = buildCloudPayload({
    dishes: [],
    weeklyPlan,
    shoppingState: {
      checked: { "auto:番茄:个": true },
      overrides: {},
      customItems: [{ id: "custom-1", name: "醋", quantity: "1瓶", category: "调料辅料", checked: true }],
    },
    settings: { cloudAnonKey: "secret" },
  }, "2026-07-02T00:00:00.000Z");

  assert.equal(payload.weeklyPlan.slots.fri.dinner, "dish-1");
  assert.equal(payload.shoppingState.checked["auto:番茄:个"], true);
  assert.equal(payload.shoppingState.customItems[0].name, "醋");
  assert.equal(payload.settings.cloudAnonKey, "");
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

test("default settings point to the shared Supabase space", () => {
  assert.equal(DEFAULT_SETTINGS.cloudUrl, "https://kchquzndyxfaldfxyzfn.supabase.co");
  assert.equal(DEFAULT_SETTINGS.cloudAnonKey, "sb_publishable_V3tGdQCaPO9B46SpkWSMmg_GjtVras_");
  assert.equal(DEFAULT_SETTINGS.syncSpace, "home-menu-2026");
  assert.equal(DEFAULT_SETTINGS.cloudSyncEnabled, true);
  assert.equal(hasCloudConfig(DEFAULT_SETTINGS), true);
});

test("normalizeSettings fills blank legacy cloud settings from defaults", () => {
  const settings = normalizeSettings({
    aiProvider: "openai",
    model: "gpt-4o-mini",
    cloudUrl: "",
    cloudAnonKey: "",
    syncSpace: "",
    cloudSyncEnabled: false,
  });

  assert.equal(settings.aiProvider, "deepseek");
  assert.equal(settings.model, DEFAULT_SETTINGS.model);
  assert.equal(settings.cloudUrl, DEFAULT_SETTINGS.cloudUrl);
  assert.equal(settings.cloudAnonKey, DEFAULT_SETTINGS.cloudAnonKey);
  assert.equal(settings.syncSpace, DEFAULT_SETTINGS.syncSpace);
  assert.equal(settings.cloudSyncEnabled, true);
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
