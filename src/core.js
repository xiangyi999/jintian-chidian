export const BACKUP_VERSION = 1;

export const DEFAULT_TAGS = ["凉爽的", "方便下饭", "快手", "清淡", "想吃甜的"];

export const DEFAULT_SETTINGS = {
  apiKey: "",
  aiProvider: "deepseek",
  model: "deepseek-v4-flash",
  cloudUrl: "https://kchquzndyxfaldfxyzfn.supabase.co",
  cloudAnonKey: "sb_publishable_V3tGdQCaPO9B46SpkWSMmg_GjtVras_",
  syncSpace: "home-menu-2026",
  cloudSyncEnabled: true,
  defaultRandomScope: "all",
  theme: "cream-dessert",
};

export function normalizeSettings(settings = {}) {
  const hadBlankCloudSetting = !String(settings.cloudUrl || "").trim()
    || !String(settings.cloudAnonKey || "").trim()
    || !String(settings.syncSpace || "").trim();
  const next = { ...DEFAULT_SETTINGS, ...settings };

  if (next.aiProvider === "openai" || /^gpt-/i.test(next.model || "")) {
    next.aiProvider = "deepseek";
    next.model = DEFAULT_SETTINGS.model;
  }

  if (!String(next.cloudUrl || "").trim()) {
    next.cloudUrl = DEFAULT_SETTINGS.cloudUrl;
  }
  if (!String(next.cloudAnonKey || "").trim()) {
    next.cloudAnonKey = DEFAULT_SETTINGS.cloudAnonKey;
  }
  if (!String(next.syncSpace || "").trim()) {
    next.syncSpace = DEFAULT_SETTINGS.syncSpace;
  }
  if (hadBlankCloudSetting) {
    next.cloudSyncEnabled = DEFAULT_SETTINGS.cloudSyncEnabled;
  }

  return next;
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueTags(tags = []) {
  return [...new Set(
    tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
  )];
}

function makeDishId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `dish-${Date.now().toString(36)}-${randomPart}`;
}

export function createDish(input = {}, timestamp = nowIso()) {
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("菜名不能为空");
  }

  return {
    id: input.id || makeDishId(),
    name,
    recipe: String(input.recipe || "").trim(),
    image: input.image || "",
    tags: uniqueTags(input.tags || []),
    favorite: Boolean(input.favorite),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export function updateDish(existing, input = {}, timestamp = nowIso()) {
  return createDish({
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
  }, timestamp);
}

export function getAllTags(dishes = []) {
  return uniqueTags(dishes.flatMap((dish) => dish.tags || []));
}

export function filterDishes(dishes = [], filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const selectedTags = uniqueTags(filters.tags || []);

  return dishes.filter((dish) => {
    if (filters.favoriteOnly && !dish.favorite) {
      return false;
    }

    if (query) {
      const haystack = `${dish.name} ${dish.recipe || ""}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return selectedTags.every((tag) => (dish.tags || []).includes(tag));
  });
}

export function pickRandomDish(dishes = [], random = Math.random, filters = {}) {
  const candidates = filterDishes(dishes, filters);
  if (!candidates.length) {
    return null;
  }
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const MEAL_KEYS = ["breakfast", "lunch", "dinner"];
export const SHOPPING_CATEGORIES = ["蔬菜类", "肉蛋禽类", "主食干货", "调料辅料"];

function getIsoWeekId(date = new Date()) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function createEmptySlots() {
  return WEEK_DAYS.reduce((days, day) => {
    days[day] = MEAL_KEYS.reduce((meals, meal) => {
      meals[meal] = "";
      return meals;
    }, {});
    return days;
  }, {});
}

export function createEmptyWeeklyPlan(date = new Date()) {
  return {
    weekId: getIsoWeekId(date),
    slots: createEmptySlots(),
  };
}

export function normalizeWeeklyPlan(plan = {}, date = new Date()) {
  const emptyPlan = createEmptyWeeklyPlan(date);
  const sourceSlots = plan?.slots || {};
  const slots = createEmptySlots();

  for (const day of WEEK_DAYS) {
    for (const meal of MEAL_KEYS) {
      slots[day][meal] = String(sourceSlots?.[day]?.[meal] || "");
    }
  }

  return {
    weekId: String(plan?.weekId || emptyPlan.weekId),
    slots,
  };
}

export function setWeeklyMeal(plan, day, meal, dishId) {
  const normalized = normalizeWeeklyPlan(plan);
  if (!WEEK_DAYS.includes(day) || !MEAL_KEYS.includes(meal)) {
    return normalized;
  }

  return {
    ...normalized,
    slots: {
      ...normalized.slots,
      [day]: {
        ...normalized.slots[day],
        [meal]: String(dishId || ""),
      },
    },
  };
}

export function clearWeeklyMeal(plan, day, meal) {
  return setWeeklyMeal(plan, day, meal, "");
}

export function createEmptyShoppingState() {
  return {
    checked: {},
    overrides: {},
    customItems: [],
  };
}

export function normalizeShoppingState(shoppingState = {}) {
  return {
    checked: { ...(shoppingState?.checked || {}) },
    overrides: { ...(shoppingState?.overrides || {}) },
    customItems: Array.isArray(shoppingState?.customItems)
      ? shoppingState.customItems.map((item) => ({
          id: String(item.id || `custom-${Date.now().toString(36)}`),
          name: String(item.name || "").trim(),
          quantity: String(item.quantity || "").trim(),
          category: SHOPPING_CATEGORIES.includes(item.category) ? item.category : "调料辅料",
          checked: Boolean(item.checked),
        })).filter((item) => item.name)
      : [],
  };
}

const CATEGORY_KEYWORDS = [
  { category: "蔬菜类", words: ["番茄", "西红柿", "青菜", "生菜", "白菜", "菠菜", "土豆", "胡萝卜", "黄瓜", "茄子", "豆芽", "菌菇", "香菇", "金针菇", "西兰花", "洋葱", "芹菜", "葱", "姜", "蒜", "辣椒", "香菜"] },
  { category: "肉蛋禽类", words: ["鸡蛋", "鸭蛋", "鹌鹑蛋", "鸡", "鸭", "鹅", "猪", "牛", "羊", "肉", "虾", "鱼", "蟹", "贝", "火腿", "培根"] },
  { category: "主食干货", words: ["米饭", "大米", "米", "面", "面条", "粉丝", "粉条", "馒头", "吐司", "面包", "年糕", "豆腐", "腐竹", "木耳", "银耳", "红豆", "绿豆"] },
  { category: "调料辅料", words: ["盐", "糖", "生抽", "老抽", "酱油", "醋", "料酒", "蚝油", "油", "淀粉", "胡椒", "花椒", "芝麻", "辣酱", "豆瓣酱", "味精", "鸡精"] },
];

function inferIngredientCategory(name = "") {
  const cleanName = String(name || "");
  const matched = CATEGORY_KEYWORDS.find((group) => group.words.some((word) => cleanName.includes(word)));
  return matched?.category || "调料辅料";
}

export function parseIngredientItem(text = "") {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) {
    return null;
  }

  const suitableText = "适量";
  if (cleanText.endsWith(suitableText)) {
    const name = cleanText.slice(0, -suitableText.length).trim() || cleanText;
    return {
      name,
      quantity: null,
      unit: "",
      quantityText: suitableText,
      category: inferIngredientCategory(name),
    };
  }

  const match = cleanText.match(/^(.+?)\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十半]+)\s*([^\d\s]*)$/u);
  if (!match) {
    return {
      name: cleanText,
      quantity: null,
      unit: "",
      quantityText: "适量",
      category: inferIngredientCategory(cleanText),
    };
  }

  const [, rawName, rawQuantity, rawUnit] = match;
  const name = rawName.trim();
  const parsedQuantity = Number(rawQuantity);
  const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : null;
  const unit = rawUnit.trim();
  return {
    name,
    quantity,
    unit,
    quantityText: `${rawQuantity}${unit}`,
    category: inferIngredientCategory(name),
  };
}

function addIngredientToMap(map, ingredient) {
  if (!ingredient?.name) return;
  const unitKey = ingredient.unit || "text";
  const key = `auto:${ingredient.name}:${unitKey}`;
  const existing = map.get(key) || [...map.values()].find((item) => item.name === ingredient.name);
  if (!existing) {
    map.set(key, {
      key,
      name: ingredient.name,
      category: ingredient.category,
      unit: ingredient.unit,
      quantity: ingredient.quantity,
      quantityText: ingredient.quantityText,
      quantityTexts: [ingredient.quantityText],
      checked: false,
      custom: false,
    });
    return;
  }

  if (existing.quantity !== null && ingredient.quantity !== null && existing.unit === ingredient.unit) {
    existing.quantity += ingredient.quantity;
    existing.quantityText = `${existing.quantity}${existing.unit}`;
    existing.quantityTexts = [existing.quantityText];
    return;
  }

  for (const text of [ingredient.quantityText]) {
    if (text && !existing.quantityTexts.includes(text)) {
      existing.quantityTexts.push(text);
    }
  }
  existing.quantity = null;
  existing.quantityText = existing.quantityTexts.join("、");
}

function getPlannedDishIds(weeklyPlan = {}) {
  const normalized = normalizeWeeklyPlan(weeklyPlan);
  return WEEK_DAYS.flatMap((day) => MEAL_KEYS.map((meal) => normalized.slots[day][meal])).filter(Boolean);
}

function groupShoppingItems(items = []) {
  return SHOPPING_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length);
}

export function buildShoppingList({ weeklyPlan, dishes = [], shoppingState = {} } = {}) {
  const normalizedShoppingState = normalizeShoppingState(shoppingState);
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const itemMap = new Map();

  for (const dishId of getPlannedDishIds(weeklyPlan)) {
    const dish = dishById.get(dishId);
    if (!dish) continue;
    const details = parseRecipeDetails(dish.recipe || "");
    for (const ingredientText of details.ingredients) {
      addIngredientToMap(itemMap, parseIngredientItem(ingredientText));
    }
  }

  const autoItems = [...itemMap.values()].map((item) => {
    const override = normalizedShoppingState.overrides[item.key] || {};
    const nextName = String(override.name || item.name).trim();
    const nextQuantity = String(override.quantity || item.quantityText || "适量").trim();
    const nextCategory = SHOPPING_CATEGORIES.includes(override.category) ? override.category : item.category;
    return {
      ...item,
      name: nextName,
      quantityText: nextQuantity,
      category: nextCategory,
      checked: Boolean(normalizedShoppingState.checked[item.key]),
    };
  });

  const customItems = normalizedShoppingState.customItems.map((item) => ({
    key: `custom:${item.id}`,
    id: item.id,
    name: item.name,
    quantityText: item.quantity || "适量",
    category: item.category,
    checked: Boolean(item.checked),
    custom: true,
  }));

  return groupShoppingItems([...autoItems, ...customItems]);
}

export function copyShoppingListText(list = []) {
  return list
    .filter((group) => group.items?.length)
    .map((group) => [
      group.category,
      ...group.items.map((item) => `${item.checked ? "☑" : "☐"} ${item.name} ${item.quantityText || "适量"}`.trim()),
    ].join("\n"))
    .join("\n\n");
}

export function buildBackup({ dishes = [], settings = {}, weeklyPlan, shoppingState } = {}, timestamp = nowIso()) {
  return {
    version: BACKUP_VERSION,
    exportedAt: timestamp,
    dishes,
    tags: getAllTags(dishes),
    weeklyPlan: normalizeWeeklyPlan(weeklyPlan),
    shoppingState: normalizeShoppingState(shoppingState),
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      apiKey: "",
      cloudAnonKey: "",
    },
  };
}

export function parseBackup(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("备份文件格式不正确");
  }

  if (!parsed || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.dishes)) {
    throw new Error("备份文件格式不正确");
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: parsed.exportedAt || "",
    dishes: parsed.dishes.map((dish) => createDish(dish, dish.updatedAt || nowIso())),
    tags: uniqueTags(parsed.tags || []),
    weeklyPlan: normalizeWeeklyPlan(parsed.weeklyPlan),
    shoppingState: normalizeShoppingState(parsed.shoppingState),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {}),
      apiKey: "",
      cloudAnonKey: "",
    },
  };
}

export function buildRecipePrompt({ dishName, tags = [] } = {}) {
  const cleanName = String(dishName || "").trim();
  const cleanTags = uniqueTags(tags);
  const tagText = cleanTags.length ? cleanTags.join("、") : "没有特别标签";

  return [
    `请为「${cleanName}」推荐一份适合家庭日常的简短做法。`,
    `偏好标签：${tagText}。`,
    "请用中文回答，结构包含：食材建议、简短做法、适合标签。",
    "语气温柔清楚，步骤不要太长，适合手机上快速阅读。",
  ].join("\n");
}

export function parseRecipeDetails(recipe = "") {
  const rawText = String(recipe || "").trim();
  const details = {
    summary: rawText,
    ingredients: [],
    steps: [],
    tips: "",
  };

  if (!rawText) {
    return details;
  }

  const lines = rawText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  let section = "steps";
  const stepLines = [];
  const tipLines = [];

  for (const line of lines) {
    const match = line.match(/^(食材|材料|食材建议|主料|辅料|调料|步骤|制作步骤|做法|简短做法|小贴士|贴士|备注|建议)[:：]?\s*(.*)$/);
    if (match) {
      const heading = match[1];
      const rest = match[2].trim();
      if (/食材|材料|主料|辅料|调料/.test(heading)) {
        section = "ingredients";
        details.ingredients.push(...splitIngredientText(rest));
        continue;
      }
      if (/步骤|做法/.test(heading)) {
        section = "steps";
        if (rest) stepLines.push(rest);
        continue;
      }
      section = "tips";
      if (rest) tipLines.push(rest);
      continue;
    }

    if (section === "ingredients") {
      details.ingredients.push(...splitIngredientText(line));
    } else if (section === "tips") {
      tipLines.push(line);
    } else {
      stepLines.push(line);
    }
  }

  details.ingredients = [...new Set(details.ingredients)];
  details.steps = normalizeStepText(stepLines.join("\n"));
  details.tips = tipLines.join("\n").trim();

  if (!details.steps.length && rawText) {
    details.steps = normalizeStepText(rawText);
  }

  return details;
}

function splitIngredientText(text = "") {
  return String(text || "")
    .replace(/适合标签.*$/u, "")
    .split(/[、，,；;\n]+/)
    .map((item) => item.replace(/^\d+[.、]\s*/, "").trim())
    .filter(Boolean);
}

function normalizeStepText(text = "") {
  return String(text || "")
    .split(/\r?\n+|(?<=。)|(?<=！)|(?<=!)/u)
    .flatMap((line) => line.split(/(?=\d+[.、]\s*)/))
    .map((item) => item.replace(/^\d+[.、]\s*/, "").trim())
    .filter(Boolean);
}

export async function requestAiRecipe({ apiKey, model = DEFAULT_SETTINGS.model, dishName, tags = [], fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error("请先在设置里填写 API Key");
  }
  if (!String(dishName || "").trim()) {
    throw new Error("请先填写菜名");
  }

  const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: buildRecipePrompt({ dishName, tags }),
        },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("AI 推荐暂时失败，请稍后再试");
  }

  const data = await response.json();
  return extractResponseText(data).trim();
}

function extractResponseText(data) {
  const choiceText = data?.choices?.[0]?.message?.content;
  if (typeof choiceText === "string") {
    return choiceText;
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n");
}

export function hasCloudConfig(settings = {}) {
  return Boolean(
    String(settings.cloudUrl || "").trim()
    && String(settings.cloudAnonKey || "").trim()
    && String(settings.syncSpace || "").trim()
  );
}

export function sanitizeSettingsForCloud(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiKey: "",
    cloudAnonKey: "",
  };
}

export function buildCloudPayload({ dishes = [], settings = {}, weeklyPlan, shoppingState } = {}, timestamp = nowIso()) {
  return {
    version: BACKUP_VERSION,
    syncedAt: timestamp,
    dishes,
    weeklyPlan: normalizeWeeklyPlan(weeklyPlan),
    shoppingState: normalizeShoppingState(shoppingState),
    settings: sanitizeSettingsForCloud(settings),
  };
}

function normalizeCloudUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value || "").trim());
}

export async function pushCloudState({ settings = {}, dishes = [], weeklyPlan, shoppingState, fetchImpl = fetch } = {}) {
  if (!hasCloudConfig(settings)) {
    throw new Error("请先填写云同步配置");
  }

  const baseUrl = normalizeCloudUrl(settings.cloudUrl);
  const row = {
    id: String(settings.syncSpace).trim(),
    payload: buildCloudPayload({ dishes, settings, weeklyPlan, shoppingState }),
    updated_at: nowIso(),
  };

  const response = await fetchImpl(`${baseUrl}/rest/v1/menu_sync?on_conflict=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: settings.cloudAnonKey,
      Authorization: `Bearer ${settings.cloudAnonKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    throw new Error("云端同步失败，请检查 Supabase 配置");
  }

  return row;
}

export async function pullCloudState({ settings = {}, fetchImpl = fetch } = {}) {
  if (!hasCloudConfig(settings)) {
    throw new Error("请先填写云同步配置");
  }

  const baseUrl = normalizeCloudUrl(settings.cloudUrl);
  const space = encodeFilterValue(settings.syncSpace);
  const response = await fetchImpl(`${baseUrl}/rest/v1/menu_sync?id=eq.${space}&select=payload,updated_at&limit=1`, {
    method: "GET",
    headers: {
      apikey: settings.cloudAnonKey,
      Authorization: `Bearer ${settings.cloudAnonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("读取云端数据失败，请检查 Supabase 配置");
  }

  const rows = await response.json();
  const payload = rows?.[0]?.payload;
  if (!payload) {
    return null;
  }

  return {
    version: BACKUP_VERSION,
    syncedAt: payload.syncedAt || "",
    dishes: Array.isArray(payload.dishes)
      ? payload.dishes.map((dish) => createDish(dish, dish.updatedAt || nowIso()))
      : [],
    weeklyPlan: normalizeWeeklyPlan(payload.weeklyPlan),
    shoppingState: normalizeShoppingState(payload.shoppingState),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(payload.settings || {}),
      apiKey: "",
      cloudAnonKey: "",
    },
  };
}
