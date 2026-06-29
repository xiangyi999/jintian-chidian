import {
  DEFAULT_SETTINGS,
  DEFAULT_TAGS,
  buildBackup,
  createDish,
  filterDishes,
  getAllTags,
  parseBackup,
  pickRandomDish,
  requestAiRecipe,
  updateDish,
} from "./core.js";

const STORAGE_KEY = "jintian-chidian-state-v1";

const sampleDishes = [
  createDish({
    name: "番茄鸡蛋饭",
    recipe: "番茄炒出汁水，倒入鸡蛋块，加一点生抽和糖，盖在热米饭上。",
    tags: ["方便下饭", "快手"],
    favorite: true,
  }, "2026-06-29T08:00:00.000Z"),
  createDish({
    name: "凉拌鸡丝面",
    recipe: "鸡胸肉煮熟撕丝，面条过凉水，拌黄瓜丝、芝麻酱、生抽和一点醋。",
    tags: ["凉爽的", "方便下饭"],
    favorite: true,
  }, "2026-06-29T08:05:00.000Z"),
  createDish({
    name: "牛奶布丁",
    recipe: "牛奶加糖小火加热，放吉利丁搅匀，冷藏到凝固，吃前加一点水果。",
    tags: ["想吃甜的"],
    favorite: false,
  }, "2026-06-29T08:10:00.000Z"),
];

const state = loadState();
const app = document.querySelector("#app");
let activeView = "home";
let selectedTags = [];
let searchQuery = "";
let favoriteOnly = false;
let editingId = null;
let currentPick = state.dishes[0] || null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      dishes: sampleDishes,
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      dishes: Array.isArray(parsed.dishes) ? parsed.dishes : sampleDishes,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch {
    return {
      dishes: sampleDishes,
      settings: { ...DEFAULT_SETTINGS },
    };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setView(view, options = {}) {
  activeView = view;
  editingId = options.editingId || null;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  render();
}

function render() {
  if (activeView === "home") renderHome();
  if (activeView === "library") renderLibrary();
  if (activeView === "editor") renderEditor();
  if (activeView === "settings") renderSettings();
}

function renderHome() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])].slice(0, 8);
  const recent = [...state.dishes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const favorites = state.dishes.filter((dish) => dish.favorite).slice(0, 3);
  const pick = currentPick || state.dishes[0] || null;

  app.innerHTML = `
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="soft-label">今天想吃点什么？</p>
        <h2>${pick ? escapeHtml(pick.name) : "先记录一道喜欢的菜"}</h2>
        <p>${pick ? escapeHtml(shortRecipe(pick.recipe)) : "把常吃的、想吃的都收进来，之后就交给随机按钮。"}
        </p>
      </div>
      <div class="doodle-frame">
        ${dishImage(pick, "今日推荐插画")}
      </div>
      <div class="tag-row">${renderTags(pick?.tags || ["凉爽的", "快手"])}</div>
      <div class="action-row">
        <button class="primary-pill" type="button" data-action="random">随机一道</button>
        <button class="secondary-pill" type="button" data-action="ai-current">AI 推荐做法</button>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <h3>按心情挑一下</h3>
        <button class="text-button" type="button" data-action="clear-tags">清空</button>
      </div>
      <div class="chip-cloud">
        ${tags.map((tag) => `
          <button class="tag-chip ${selectedTags.includes(tag) ? "is-selected" : ""}" type="button" data-action="toggle-home-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
        `).join("")}
      </div>
    </section>

    <section class="quick-add">
      <button type="button" data-view="editor">
        <span>记录新菜</span>
        <small>菜名、做法、图片都可以慢慢补</small>
      </button>
    </section>

    <section class="section-block">
      <div class="section-heading"><h3>我的收藏</h3><button class="text-button" type="button" data-view="library" data-favorites="true">查看</button></div>
      ${renderDishRows(favorites, "还没有收藏，遇到想吃的就点一下收藏。")}
    </section>

    <section class="section-block">
      <div class="section-heading"><h3>最近添加</h3><button class="text-button" type="button" data-view="library">全部</button></div>
      ${renderDishRows(recent, "还没有菜谱，从记录第一道开始。")}
    </section>
  `;
}

function renderLibrary() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])];
  const dishes = filterDishes(state.dishes, {
    query: searchQuery,
    tags: selectedTags,
    favoriteOnly,
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  app.innerHTML = `
    <section class="page-title">
      <p class="soft-label">我的菜谱</p>
      <h2>慢慢攒，吃饭就不慌</h2>
    </section>
    <div class="search-box">
      <input value="${escapeAttr(searchQuery)}" type="search" data-input="search" placeholder="搜菜名或做法">
    </div>
    <div class="filter-line">
      <button class="tag-chip ${favoriteOnly ? "is-selected" : ""}" type="button" data-action="toggle-favorite-filter">只看收藏</button>
      ${tags.map((tag) => `
        <button class="tag-chip ${selectedTags.includes(tag) ? "is-selected" : ""}" type="button" data-action="toggle-home-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
      `).join("")}
    </div>
    <section class="dish-list" id="dish-list">
      ${renderDishCards(dishes)}
    </section>
  `;
}

function refreshDishList() {
  const list = document.querySelector("#dish-list");
  if (!list) return;
  const dishes = filterDishes(state.dishes, {
    query: searchQuery,
    tags: selectedTags,
    favoriteOnly,
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  list.innerHTML = renderDishCards(dishes);
}

function renderEditor() {
  const dish = editingId ? state.dishes.find((item) => item.id === editingId) : null;
  const tagValue = dish?.tags?.join("，") || "";

  app.innerHTML = `
    <section class="page-title">
      <p class="soft-label">${dish ? "编辑这道菜" : "添加一道菜"}</p>
      <h2>${dish ? escapeHtml(dish.name) : "把想吃的收进来"}</h2>
    </section>
    <form class="editor-form" data-form="dish">
      <label>
        <span>菜名</span>
        <input name="name" required maxlength="30" value="${escapeAttr(dish?.name || "")}" placeholder="比如：凉拌鸡丝面">
      </label>
      <label>
        <span>做法</span>
        <textarea name="recipe" rows="6" placeholder="简单写几步，或者稍后让 AI 推荐">${escapeHtml(dish?.recipe || "")}</textarea>
      </label>
      <label>
        <span>标签</span>
        <input name="tags" value="${escapeAttr(tagValue)}" placeholder="凉爽的，方便下饭，快手">
      </label>
      <label class="image-picker">
        <span>图片</span>
        <input name="imageFile" type="file" accept="image/*">
        <input name="image" type="hidden" value="${escapeAttr(dish?.image || "")}">
        <div class="image-preview">${dishImage(dish, "菜品图片预览")}</div>
      </label>
      <label class="check-row">
        <input name="favorite" type="checkbox" ${dish?.favorite ? "checked" : ""}>
        <span>加入我的收藏</span>
      </label>
      <div class="form-actions">
        <button class="primary-pill" type="submit">${dish ? "保存修改" : "保存菜谱"}</button>
        <button class="secondary-pill" type="button" data-action="ai-form">AI 补做法</button>
        ${dish ? `<button class="danger-pill" type="button" data-action="delete-dish" data-id="${escapeAttr(dish.id)}">删除</button>` : ""}
      </div>
    </form>
  `;
}

function renderSettings() {
  app.innerHTML = `
    <section class="page-title">
      <p class="soft-label">设置和备份</p>
      <h2>把小菜单好好收着</h2>
    </section>
    <form class="editor-form" data-form="settings">
      <label>
        <span>OpenAI API Key</span>
        <input name="apiKey" type="password" value="${escapeAttr(state.settings.apiKey || "")}" placeholder="只保存在本机浏览器">
      </label>
      <label>
        <span>AI 模型</span>
        <input name="model" value="${escapeAttr(state.settings.model || DEFAULT_SETTINGS.model)}" placeholder="gpt-5.4-mini">
      </label>
      <label>
        <span>默认随机范围</span>
        <select name="defaultRandomScope">
          <option value="all" ${state.settings.defaultRandomScope === "all" ? "selected" : ""}>全部菜谱</option>
          <option value="favorites" ${state.settings.defaultRandomScope === "favorites" ? "selected" : ""}>只从收藏</option>
        </select>
      </label>
      <button class="primary-pill" type="submit">保存设置</button>
    </form>

    <section class="section-block">
      <div class="section-heading"><h3>备份</h3><p>${state.dishes.length} 道菜</p></div>
      <div class="action-row">
        <button class="secondary-pill" type="button" data-action="export">导出备份</button>
        <label class="secondary-pill import-button">导入备份<input type="file" accept="application/json" data-input="import"></label>
      </div>
      <p class="hint">导出的文件不包含 API Key，适合换设备或后续放进 git 仓库保管。</p>
    </section>

    <section class="section-block danger-zone">
      <h3>清空本地数据</h3>
      <p>只会清空这台设备浏览器里的菜谱和设置。</p>
      <button class="danger-pill" type="button" data-action="clear-data">清空数据</button>
    </section>
  `;
}

function renderDishCards(dishes) {
  if (!dishes.length) {
    return `<div class="empty-state"><img src="./assets/food-doodles.png" alt=""><p>还没有符合条件的菜。</p></div>`;
  }

  return dishes.map((dish) => `
    <article class="dish-card">
      <div class="thumb">${dishImage(dish, `${dish.name} 图片`)}</div>
      <div class="dish-info">
        <div class="dish-title-row">
          <h3>${escapeHtml(dish.name)}</h3>
          <button class="mini-button" type="button" data-action="toggle-favorite" data-id="${escapeAttr(dish.id)}">${dish.favorite ? "已收藏" : "收藏"}</button>
        </div>
        <p>${escapeHtml(shortRecipe(dish.recipe))}</p>
        <div class="tag-row">${renderTags(dish.tags)}</div>
        <div class="tiny-actions">
          <button type="button" data-action="edit-dish" data-id="${escapeAttr(dish.id)}">编辑</button>
          <button type="button" data-action="ai-dish" data-id="${escapeAttr(dish.id)}">AI 做法</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderDishRows(dishes, emptyText) {
  if (!dishes.length) {
    return `<p class="muted">${emptyText}</p>`;
  }

  return `<div class="row-list">${dishes.map((dish) => `
    <button class="dish-row" type="button" data-action="edit-dish" data-id="${escapeAttr(dish.id)}">
      <span class="row-thumb">${dishImage(dish, "")}</span>
      <span><strong>${escapeHtml(dish.name)}</strong><small>${escapeHtml((dish.tags || []).join(" / ") || "未加标签")}</small></span>
    </button>
  `).join("")}</div>`;
}

function renderTags(tags = []) {
  return (tags.length ? tags : ["未加标签"]).map((tag) => `<span class="tag-dot">${escapeHtml(tag)}</span>`).join("");
}

function dishImage(dish, alt) {
  const src = dish?.image || "./assets/food-doodles.png";
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
}

function shortRecipe(recipe = "") {
  const text = recipe.trim();
  if (!text) return "还没有写做法，可以让 AI 先帮你起一版。";
  return text.length > 46 ? `${text.slice(0, 46)}...` : text;
}

function toggleTag(tag) {
  selectedTags = selectedTags.includes(tag)
    ? selectedTags.filter((item) => item !== tag)
    : [...selectedTags, tag];
  render();
}

function randomPick() {
  const filters = { tags: selectedTags };
  if (state.settings.defaultRandomScope === "favorites") {
    filters.favoriteOnly = true;
  }
  currentPick = pickRandomDish(state.dishes, Math.random, filters);
  if (!currentPick) {
    showToast("没有符合条件的菜，换个标签试试。");
    return;
  }
  activeView = "home";
  renderHome();
}

async function fillAiRecipeForForm() {
  const form = document.querySelector("[data-form='dish']");
  const name = form?.elements.name.value.trim();
  const tags = splitTags(form?.elements.tags.value || "");
  if (!name) {
    showToast("先写一个菜名，AI 才知道要推荐什么。");
    return;
  }
  await runAiRecipe(name, tags, (text) => {
    form.elements.recipe.value = text;
  });
}

async function runAiRecipe(dishName, tags, onText) {
  try {
    showToast("正在问 AI，稍等一下。");
    const text = await requestAiRecipe({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      dishName,
      tags,
    });
    onText(text);
    showToast("AI 做法已生成。");
  } catch (error) {
    showToast(error.message || "AI 推荐暂时失败。");
    if (!state.settings.apiKey) {
      setView("settings");
    }
  }
}

function splitTags(value) {
  return value
    .split(/[，,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function saveDishFromForm(form) {
  const image = form.elements.image.value;
  const input = {
    name: form.elements.name.value,
    recipe: form.elements.recipe.value,
    tags: splitTags(form.elements.tags.value),
    image,
    favorite: form.elements.favorite.checked,
  };

  if (editingId) {
    const index = state.dishes.findIndex((dish) => dish.id === editingId);
    state.dishes[index] = updateDish(state.dishes[index], input);
    currentPick = state.dishes[index];
    showToast("这道菜已经更新。");
  } else {
    const dish = createDish(input);
    state.dishes.unshift(dish);
    currentPick = dish;
    showToast("已经收进菜谱。");
  }

  persist();
  setView("home");
}

function exportBackup() {
  const backup = buildBackup(state);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `今日吃点备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("备份文件已生成。");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const backup = parseBackup(text);
    const mode = confirm(`发现 ${backup.dishes.length} 道菜。选择“确定”覆盖当前数据，选择“取消”合并导入。`);
    if (mode) {
      state.dishes = backup.dishes;
    } else {
      const existingIds = new Set(state.dishes.map((dish) => dish.id));
      state.dishes = [...backup.dishes.filter((dish) => !existingIds.has(dish.id)), ...state.dishes];
    }
    state.settings = { ...state.settings, ...backup.settings, apiKey: state.settings.apiKey };
    persist();
    showToast("备份已经导入。");
    render();
  } catch (error) {
    showToast(error.message || "备份文件无法导入。");
  }
}

function readImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const form = input.closest("form");
    form.elements.image.value = String(reader.result || "");
    const preview = form.querySelector(".image-preview");
    preview.innerHTML = `<img src="${escapeAttr(String(reader.result || ""))}" alt="菜品图片预览">`;
  });
  reader.readAsDataURL(file);
}

function showToast(message) {
  const template = document.querySelector("#toast-template");
  const toast = template.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  }, 2300);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, label, [data-view]");
  if (!target) return;

  const view = target.dataset.view;
  if (view) {
    if (target.dataset.favorites) favoriteOnly = true;
    setView(view);
    return;
  }

  const action = target.dataset.action;
  if (!action) return;

  if (action === "go-settings") setView("settings");
  if (action === "random") randomPick();
  if (action === "clear-tags") {
    selectedTags = [];
    render();
  }
  if (action === "toggle-home-tag") toggleTag(target.dataset.tag);
  if (action === "toggle-favorite-filter") {
    favoriteOnly = !favoriteOnly;
    render();
  }
  if (action === "edit-dish") setView("editor", { editingId: target.dataset.id });
  if (action === "toggle-favorite") {
    const dish = state.dishes.find((item) => item.id === target.dataset.id);
    dish.favorite = !dish.favorite;
    dish.updatedAt = new Date().toISOString();
    persist();
    render();
  }
  if (action === "delete-dish") {
    if (confirm("确定删除这道菜吗？")) {
      state.dishes = state.dishes.filter((dish) => dish.id !== target.dataset.id);
      persist();
      setView("library");
    }
  }
  if (action === "ai-current" && currentPick) {
    await runAiRecipe(currentPick.name, currentPick.tags, (text) => {
      currentPick.recipe = text;
      currentPick.updatedAt = new Date().toISOString();
      persist();
      renderHome();
    });
  }
  if (action === "ai-dish") {
    const dish = state.dishes.find((item) => item.id === target.dataset.id);
    await runAiRecipe(dish.name, dish.tags, (text) => {
      dish.recipe = text;
      dish.updatedAt = new Date().toISOString();
      persist();
      render();
    });
  }
  if (action === "ai-form") await fillAiRecipeForForm();
  if (action === "export") exportBackup();
  if (action === "clear-data") {
    if (confirm("确定清空所有本地数据吗？这个操作不能撤销。")) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-input='search']")) {
    searchQuery = event.target.value;
    refreshDishList();
  }
  if (event.target.name === "imageFile") {
    readImageFile(event.target);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-input='import']")) {
    importBackup(event.target.files?.[0]);
  }
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;

  if (form.dataset.form === "dish") {
    try {
      saveDishFromForm(form);
    } catch (error) {
      showToast(error.message || "保存失败，请检查内容。");
    }
  }

  if (form.dataset.form === "settings") {
    state.settings = {
      ...state.settings,
      apiKey: form.elements.apiKey.value.trim(),
      model: form.elements.model.value.trim() || DEFAULT_SETTINGS.model,
      defaultRandomScope: form.elements.defaultRandomScope.value,
    };
    persist();
    showToast("设置已保存。");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

render();
