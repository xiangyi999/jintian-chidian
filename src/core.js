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

export function buildCloudPayload({ dishes = [], settings = {} } = {}, timestamp = nowIso()) {
  return {
    version: BACKUP_VERSION,
    syncedAt: timestamp,
    dishes,
    settings: sanitizeSettingsForCloud(settings),
  };
}

function normalizeCloudUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value || "").trim());
}

export async function pushCloudState({ settings = {}, dishes = [], fetchImpl = fetch } = {}) {
  if (!hasCloudConfig(settings)) {
    throw new Error("请先填写云同步配置");
  }

  const baseUrl = normalizeCloudUrl(settings.cloudUrl);
  const row = {
    id: String(settings.syncSpace).trim(),
    payload: buildCloudPayload({ dishes, settings }),
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
    settings: {
      ...DEFAULT_SETTINGS,
      ...(payload.settings || {}),
      apiKey: "",
      cloudAnonKey: "",
    },
  };
}
