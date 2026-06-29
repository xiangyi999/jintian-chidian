export const BACKUP_VERSION = 1;

export const DEFAULT_TAGS = ["凉爽的", "方便下饭", "快手", "清淡", "想吃甜的"];

export const DEFAULT_SETTINGS = {
  apiKey: "",
  aiProvider: "openai",
  model: "gpt-5.4-mini",
  defaultRandomScope: "all",
  theme: "cream-dessert",
};

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

export function buildBackup({ dishes = [], settings = {} } = {}, timestamp = nowIso()) {
  return {
    version: BACKUP_VERSION,
    exportedAt: timestamp,
    dishes,
    tags: getAllTags(dishes),
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      apiKey: "",
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
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {}),
      apiKey: "",
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

export async function requestAiRecipe({ apiKey, model = DEFAULT_SETTINGS.model, dishName, tags = [], fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error("请先在设置里填写 API Key");
  }
  if (!String(dishName || "").trim()) {
    throw new Error("请先填写菜名");
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: buildRecipePrompt({ dishName, tags }),
    }),
  });

  if (!response.ok) {
    throw new Error("AI 推荐暂时失败，请稍后再试");
  }

  const data = await response.json();
  return extractResponseText(data).trim();
}

function extractResponseText(data) {
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
