import {
  DEFAULT_SETTINGS,
  DEFAULT_TAGS,
  buildBackup,
  buildShoppingList,
  clearWeeklyMeal,
  copyShoppingListText,
  createDish,
  createEmptyShoppingState,
  createEmptyWeeklyPlan,
  filterDishes,
  friendlyErrorMessage,
  friendlyUploadError,
  getAllTags,
  hasCloudConfig,
  normalizeSettings,
  normalizeShoppingState,
  normalizeWeeklyPlan,
  parseIngredientInput,
  parseRecipeDetails,
  parseBackup,
  pickRandomDish,
  pullCloudState,
  pushCloudState,
  requestAiRecipe,
  setWeeklyMeal,
  updateDish,
  uploadDishImage,
} from "./core.js?v=20260706-v1";

const STORAGE_KEY = "jintian-chidian-state-v1";
const IMAGE_MAX_EDGE = 900;
const IMAGE_QUALITY = 0.75;
const IMAGE_MAX_DATA_URL_LENGTH = 2200000;

const sampleDishes = [
  createDish({
    name: "番茄鸡蛋饭",
    recipe: "食材：番茄、鸡蛋、米饭\n步骤：1. 番茄炒出汁。2. 倒入鸡蛋块，加一点生抽和糖，盖在热米饭上。\n小贴士：喜欢酸甜可以多加一点番茄。",
    tags: ["方便下饭", "快手"],
    favorite: true,
  }, "2026-06-29T08:00:00.000Z"),
  createDish({
    name: "凉拌鸡丝面",
    recipe: "食材：鸡胸肉、面条、黄瓜、芝麻酱\n步骤：1. 鸡胸肉煮熟撕丝。2. 面条过凉水。3. 拌黄瓜丝、芝麻酱、生抽和一点醋。",
    tags: ["凉爽的", "方便下饭"],
    favorite: true,
  }, "2026-06-29T08:05:00.000Z"),
  createDish({
    name: "牛奶布丁",
    recipe: "食材：牛奶、糖、吉利丁、水果\n步骤：1. 牛奶加糖小火加热。2. 放吉利丁搅匀。3. 冷藏到凝固，吃前加一点水果。",
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
let detailId = null;
let detailReturnView = "library";
let editorReturnView = "home";
let currentPick = state.dishes[0] || null;
let mealPicker = {
  open: false,
  day: "",
  meal: "",
  tags: [],
};

const dayLabels = {
  mon: "周一",
  tue: "周二",
  wed: "周三",
  thu: "周四",
  fri: "周五",
  sat: "周六",
  sun: "周日",
};

const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

const mealIcons = {
  breakfast: "🌞",
  lunch: "🌤️",
  dinner: "🌙",
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      dishes: sampleDishes,
      settings: { ...DEFAULT_SETTINGS },
      weeklyPlan: createEmptyWeeklyPlan(),
      shoppingState: createEmptyShoppingState(),
    };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      dishes: Array.isArray(parsed.dishes) ? parsed.dishes : sampleDishes,
      settings: normalizeSettings(parsed.settings || {}),
      weeklyPlan: normalizeWeeklyPlan(parsed.weeklyPlan),
      shoppingState: normalizeShoppingState(parsed.shoppingState),
    };
  } catch {
    return {
      dishes: sampleDishes,
      settings: { ...DEFAULT_SETTINGS },
      weeklyPlan: createEmptyWeeklyPlan(),
      shoppingState: createEmptyShoppingState(),
    };
  }
}

function persist(options = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast(friendlyErrorMessage(error));
    return false;
  }
  if (options.sync) {
    syncToCloudSilently();
  }
  return true;
}

async function syncToCloudSilently() {
  if (!state.settings.cloudSyncEnabled || !hasCloudConfig(state.settings)) {
    return;
  }

  try {
    await pushCloudState(state);
    showToast("已同步到云端。");
  } catch (error) {
    showToast(error.message || "云端同步失败。");
  }
}

function setView(view, options = {}) {
  if (view === "settings") {
    view = "my";
  }
  const previousView = activeView;
  activeView = view;
  editingId = options.editingId || null;
  detailId = options.detailId || detailId;
  if (view === "detail") {
    detailId = options.detailId || detailId || currentPick?.id || null;
    detailReturnView = options.returnView || (previousView === "detail" ? detailReturnView : previousView);
  }
  if (view === "editor") {
    editorReturnView = options.returnView || "home";
  }
  document.querySelector(".app-shell")?.classList.toggle("is-detail-view", view === "detail");
  document.querySelector(".app-shell")?.classList.toggle("has-fixed-action", view === "weekly" || view === "shopping");
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  render();
}

function render() {
  if (activeView === "home") renderHome();
  if (activeView === "library") renderLibrary();
  if (activeView === "editor") renderEditor();
  if (activeView === "my") renderMy();
  if (activeView === "detail") renderDetail();
  if (activeView === "weekly") renderWeeklyPlan();
  if (activeView === "shopping") renderShoppingList();
}

function renderHomeLegacy() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])].slice(0, 8);
  const recent = [...state.dishes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const favorites = state.dishes.filter((dish) => dish.favorite).slice(0, 3);
  const pick = currentPick || state.dishes[0] || null;

  app.innerHTML = `
    <section class="hero-panel">
      <div class="hero-copy hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">
        <p class="soft-label">今天想吃点什么？</p>
        <h2>${pick ? escapeHtml(pick.name) : "先记录一道喜欢的菜"}</h2>
        <p>${pick ? escapeHtml(shortRecipe(pick.recipe)) : "把常吃的、想吃的都收进来，之后就交给随机按钮。"}</p>
      </div>
      <div class="doodle-frame hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">
        ${dishImage(pick, "今日推荐插画")}
      </div>
      <div class="tag-row hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">${renderTags(pick?.tags || ["凉爽的", "快手"])}</div>
      <div class="action-row">
        <button class="primary-pill" type="button" data-action="random">随机一道</button>
        <button class="secondary-pill" type="button" data-action="ai-current">AI 推荐做法</button>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <h3>按心情挑一个</h3>
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

    <section class="weekly-entry">
      <button type="button" data-view="weekly">
        <span>📅 一周菜谱计划</span>
        <small>提前排好早午晚餐，一键汇总采购清单</small>
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
  const ingredientValue = (dish?.ingredients || []).join("\n");

  app.innerHTML = `
    <section class="page-title">
      <p class="soft-label">${dish ? "编辑这道菜" : "添加一道菜"}</p>
      <h2>${dish ? escapeHtml(dish.name) : "把想吃的收进来"}</h2>
    </section>
    <form class="editor-form" data-form="dish">
      <label class="form-field-card">
        <span>菜名</span>
        <input name="name" required maxlength="30" value="${escapeAttr(dish?.name || "")}" placeholder="比如：凉拌鸡丝面">
      </label>
      <label class="form-field-card">
        <span>食材清单</span>
        <textarea name="ingredients" rows="4" placeholder="一行填写一种食材+数量，例：鸡蛋 2个">${escapeHtml(ingredientValue)}</textarea>
      </label>
      <label class="form-field-card">
        <span>文字做法</span>
        <textarea name="recipe" rows="6" placeholder="分步填写烹饪步骤">${escapeHtml(dish?.recipe || "")}</textarea>
      </label>
      <label class="form-field-card">
        <span>视频做法链接</span>
        <input name="videoUrl" value="${escapeAttr(dish?.videoUrl || "")}" placeholder="粘贴抖音视频链接">
      </label>
      <label class="form-field-card">
        <span>标签</span>
        <input name="tags" value="${escapeAttr(tagValue)}" placeholder="凉爽的，方便下饭，快手">
      </label>
      <label class="form-field-card image-picker">
        <span>图片</span>
        <input name="imageFile" type="file" accept="image/*">
        <input name="image" type="hidden" value="${escapeAttr(dish?.image || "")}">
        <input name="imagePath" type="hidden" value="${escapeAttr(dish?.imagePath || "")}">
        <div class="image-preview">${dishImage(dish, "菜品图片预览")}</div>
      </label>
      <label class="form-field-card check-row">
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

function renderDetail() {
  const dish = state.dishes.find((item) => item.id === detailId) || currentPick || state.dishes[0];
  if (!dish) {
    app.innerHTML = `<section class="empty-state"><img src="./assets/food-doodles.png" alt=""><p>这道菜暂时找不到了。</p></section>`;
    return;
  }

  detailId = dish.id;
  currentPick = dish;
  const details = parseRecipeDetails(dish.recipe);
  const ingredients = dish.ingredients?.length ? dish.ingredients : details.ingredients;
  const tags = dish.tags?.length ? dish.tags : ["未加标签"];

  app.innerHTML = `
    <article class="recipe-detail-card">
      <header class="recipe-detail-top">
        <button class="round-icon-button" type="button" data-action="detail-back" aria-label="返回">‹</button>
        <h2>${escapeHtml(dish.name)}</h2>
        <div class="detail-tools">
          <button class="round-icon-button" type="button" data-action="edit-dish" data-id="${escapeAttr(dish.id)}" aria-label="编辑">✎</button>
          <details class="detail-more">
            <summary aria-label="更多操作">⋯</summary>
            <div>
              <button type="button" data-action="delete-dish" data-id="${escapeAttr(dish.id)}">删除菜谱</button>
            </div>
          </details>
        </div>
      </header>

      <button class="detail-hero-image" type="button" data-action="open-image" aria-label="查看大图">
        ${dishImage(dish, `${dish.name} 图片`)}
        <span class="detail-sticker" aria-hidden="true"></span>
      </button>

      <section class="detail-meta">
        <div class="detail-tag-list">
          ${tags.map((tag) => `<button class="tag-chip" type="button" data-action="detail-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join("")}
        </div>
        <p>${estimateCookMeta(details.steps)} · ${syncStatusText()}</p>
      </section>

      <section class="detail-module">
        <div class="detail-module-title">
          <span class="module-mark">01</span>
          <h3>食材清单</h3>
        </div>
        ${renderIngredientList(ingredients)}
      </section>

      ${renderVideoLink(dish.videoUrl)}

      <section class="detail-module">
        <div class="detail-module-title">
          <span class="module-mark">02</span>
          <h3>制作步骤</h3>
        </div>
        ${renderStepList(details.steps)}
      </section>

      ${details.tips ? `
        <section class="detail-module detail-tips">
          <div class="detail-module-title">
            <span class="module-mark">03</span>
            <h3>灏忚创澹?/h3>
          </div>
          <p>${escapeHtml(details.tips)}</p>
        </section>
      ` : ""}
    </article>

    <div class="detail-bottom-bar">
      <button class="primary-pill" type="button" data-action="detail-random">重新随机</button>
      <button class="secondary-pill" type="button" data-action="detail-list">返回列表</button>
    </div>

    <div class="image-lightbox" hidden data-lightbox>
      <button type="button" data-action="close-image" aria-label="鍏抽棴澶у浘">脳</button>
      ${dishImage(dish, `${dish.name} 澶у浘`)}
    </div>
  `;
}

function renderIngredientList(ingredients = []) {
  if (!ingredients.length) {
    return `<p class="muted">还没有单独写食材，可以在编辑里补上“食材：鸡蛋、番茄、米饭”。</p>`;
  }

  return `<ul class="ingredient-list">${ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderVideoLink(videoUrl = "") {
  if (!videoUrl) {
    return "";
  }

  return `
    <section class="detail-module detail-video">
      <div class="detail-module-title">
        <span class="module-mark">▶</span>
        <h3>视频做法</h3>
      </div>
      <a class="video-pill" href="${escapeAttr(videoUrl)}" target="_blank" rel="noopener noreferrer">看视频做法</a>
      <p class="muted">会跳转到外部视频页面，适合边看边做。</p>
    </section>
  `;
}

function renderStepList(steps = []) {
  if (!steps.length) {
    return `<p class="muted">还没有写做法，可以先用 AI 补一版。</p>`;
  }

  return `<ol class="step-list">${steps.map((step, index) => `
    <li>
      <span>${index + 1}</span>
      <p>${escapeHtml(step)}</p>
    </li>
  `).join("")}</ol>`;
}

function renderWeeklyPlanLegacy() {
  state.weeklyPlan = normalizeWeeklyPlan(state.weeklyPlan);
  app.innerHTML = `
    <section class="page-title weekly-title">
      <div>
        <p class="soft-label">提前规划三餐，一键汇总食材</p>
        <h2>📅 我的一周菜谱</h2>
      </div>
      <button class="text-button" type="button" data-action="reset-weekly-plan">重置本周计划</button>
    </section>

    <section class="weekly-board">
      ${Object.entries(dayLabels).map(([day, label]) => renderDayCard(day, label)).join("")}
    </section>

    <div class="fixed-action-bar">
      <button class="primary-pill" type="button" data-action="open-shopping-list">🛒 生成本周食材采购清单</button>
    </div>

    ${mealPicker.open ? renderMealPicker() : ""}
  `;
}

function renderDayCard(day, label) {
  return `
    <article class="day-card">
      <h3>${label}</h3>
      <div class="meal-list">
        ${Object.entries(mealLabels).map(([meal, mealLabel]) => renderMealRow(day, meal, mealLabel)).join("")}
      </div>
    </article>
  `;
}

function renderMealRowLegacy(day, meal, mealLabel) {
  const dishId = state.weeklyPlan?.slots?.[day]?.[meal] || "";
  const dish = state.dishes.find((item) => item.id === dishId);
  return `
    <button class="meal-row" type="button" data-action="open-meal-picker" data-day="${day}" data-meal="${meal}">
      <span class="meal-label">${mealIcons[meal]} ${mealLabel}</span>
      ${dish ? `
        <span class="meal-dish">
          <span class="meal-thumb">${dishImage(dish, "")}</span>
          <strong>${escapeHtml(dish.name)}</strong>
        </span>
      ` : `<span class="meal-empty">点击选择菜谱</span>`}
    </button>
  `;
}

function renderMealPickerLegacy() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])];
  const filteredDishes = filterDishes(state.dishes, { tags: mealPicker.tags })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const currentDishId = state.weeklyPlan?.slots?.[mealPicker.day]?.[mealPicker.meal] || "";
  const title = `${dayLabels[mealPicker.day] || ""} · ${mealLabels[mealPicker.meal] || ""}`;

  return `
    <div class="sheet-backdrop" data-action="close-meal-picker"></div>
    <section class="meal-picker-sheet" role="dialog" aria-modal="true" aria-label="选择菜谱">
      <div class="sheet-handle"></div>
      <div class="sheet-title">
        <div>
          <p class="soft-label">选择菜谱</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <button class="round-icon-button" type="button" data-action="close-meal-picker" aria-label="关闭">×</button>
      </div>
      <div class="filter-line meal-picker-tags">
        ${tags.map((tag) => `
          <button class="tag-chip ${mealPicker.tags.includes(tag) ? "is-selected" : ""}" type="button" data-action="toggle-picker-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
        `).join("")}
      </div>
      <div class="picker-dish-list">
        ${filteredDishes.length ? filteredDishes.map((dish) => `
          <button class="picker-dish ${dish.id === currentDishId ? "is-selected" : ""}" type="button" data-action="select-meal-dish" data-id="${escapeAttr(dish.id)}">
            <span class="row-thumb">${dishImage(dish, "")}</span>
            <span><strong>${escapeHtml(dish.name)}</strong><small>${escapeHtml((dish.tags || []).join(" / ") || "未加标签")}</small></span>
          </button>
        `).join("") : `<p class="muted">还没有符合标签的菜谱。</p>`}
      </div>
      <div class="sheet-actions">
        <button class="secondary-pill" type="button" data-action="clear-meal-slot">清空这个餐位</button>
      </div>
    </section>
  `;
}

function renderShoppingListLegacy() {
  const list = buildShoppingList({
    weeklyPlan: state.weeklyPlan,
    dishes: state.dishes,
    shoppingState: state.shoppingState,
  });

  app.innerHTML = `
    <section class="page-title shopping-title">
      <button class="round-icon-button" type="button" data-view="weekly" aria-label="返回">‹</button>
      <div>
        <p class="soft-label">已汇总本周全部早/中/晚餐食材</p>
        <h2>本周食材采购清单</h2>
      </div>
    </section>

    <section class="shopping-list">
      ${list.length ? list.map(renderShoppingGroup).join("") : `
        <div class="empty-state">
          <img src="./assets/food-doodles.png" alt="">
          <p>本周还没安排菜谱，先回去选几道想吃的。</p>
        </div>
      `}
    </section>

    <form class="custom-ingredient-form" data-form="custom-ingredient">
      <h3>添加自定义食材</h3>
      <input name="name" maxlength="24" placeholder="比如：葱姜">
      <input name="quantity" maxlength="24" placeholder="数量：适量">
      <select name="category">
        <option value="蔬菜类">蔬菜类</option>
        <option value="肉蛋禽类">肉蛋禽类</option>
        <option value="主食干货">主食干货</option>
        <option value="调料辅料" selected>调料辅料</option>
      </select>
      <button class="secondary-pill" type="submit">+ 添加自定义食材</button>
    </form>

    <div class="fixed-action-bar two-actions">
      <button class="secondary-pill" type="button" data-view="weekly">返回计划</button>
      <button class="primary-pill" type="button" data-action="copy-shopping-list">一键复制清单</button>
    </div>
  `;
}

function renderShoppingGroup(group) {
  return `
    <article class="shopping-card">
      <h3>${escapeHtml(group.category)}</h3>
      <div class="shopping-items">
        ${group.items.map(renderShoppingItem).join("")}
      </div>
    </article>
  `;
}

function renderShoppingItem(item) {
  return `
    <div class="shopping-item ${item.checked ? "is-checked" : ""}">
      <input class="shopping-check" type="checkbox" ${item.checked ? "checked" : ""} data-shopping-check="${escapeAttr(item.key)}">
      <input class="shopping-name" value="${escapeAttr(item.name)}" data-shopping-field="name" data-key="${escapeAttr(item.key)}">
      <input class="shopping-quantity" value="${escapeAttr(item.quantityText || "")}" data-shopping-field="quantity" data-key="${escapeAttr(item.key)}">
      ${item.custom ? `<button class="text-button" type="button" data-action="delete-custom-item" data-id="${escapeAttr(item.id)}">删除</button>` : ""}
    </div>
  `;
}

function renderWeeklyPlan() {
  state.weeklyPlan = normalizeWeeklyPlan(state.weeklyPlan);
  app.innerHTML = `
    <section class="page-title weekly-title">
      <button class="round-icon-button" type="button" data-action="weekly-back-home" aria-label="返回首页">‹</button>
      <div class="weekly-title-copy">
        <p class="soft-label">提前规划三餐，一键汇总食材</p>
        <h2>我的一周菜谱</h2>
      </div>
      <button class="text-button" type="button" data-action="reset-weekly-plan-v2">重置本周计划</button>
    </section>

    <section class="weekly-board">
      ${Object.entries(dayLabels).map(([day, label]) => renderDayCard(day, label)).join("")}
    </section>

    <div class="fixed-action-bar">
      <button class="primary-pill" type="button" data-action="open-shopping-list">生成本周食材采购清单</button>
    </div>

    ${mealPicker.open ? renderMealPicker() : ""}
  `;
}

function renderMealRow(day, meal, mealLabel) {
  const dishId = state.weeklyPlan?.slots?.[day]?.[meal] || "";
  const dish = state.dishes.find((item) => item.id === dishId);
  return `
    <button class="meal-row" type="button" data-action="open-meal-picker" data-day="${day}" data-meal="${meal}">
      <span class="meal-label">${mealIcons[meal]} ${mealLabel}</span>
      ${dish ? `
        <span class="meal-dish">
          <span class="meal-thumb">${dishImage(dish, "")}</span>
          <strong>${escapeHtml(dish.name)}</strong>
          <em>已选</em>
        </span>
      ` : `<span class="meal-empty">点击选择菜谱</span>`}
    </button>
  `;
}

function renderMealPicker() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])];
  const filteredDishes = filterDishes(state.dishes, { tags: mealPicker.tags })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const currentDishId = state.weeklyPlan?.slots?.[mealPicker.day]?.[mealPicker.meal] || "";
  const title = `${dayLabels[mealPicker.day] || ""} · ${mealLabels[mealPicker.meal] || ""}`;

  return `
    <div class="sheet-backdrop" data-action="close-meal-picker"></div>
    <section class="meal-picker-sheet" role="dialog" aria-modal="true" aria-label="选择菜谱">
      <div class="sheet-handle"></div>
      <div class="sheet-title">
        <div>
          <p class="soft-label">选择菜谱</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <button class="round-icon-button" type="button" data-action="close-meal-picker" aria-label="关闭">×</button>
      </div>
      <div class="filter-line meal-picker-tags">
        ${tags.map((tag) => `
          <button class="tag-chip ${mealPicker.tags.includes(tag) ? "is-selected" : ""}" type="button" data-action="toggle-picker-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
        `).join("")}
      </div>
      <div class="picker-dish-list">
        ${filteredDishes.length ? filteredDishes.map((dish) => `
          <button class="picker-dish ${dish.id === currentDishId ? "is-selected" : ""}" type="button" data-action="select-meal-dish" data-id="${escapeAttr(dish.id)}">
            <span class="row-thumb">${dishImage(dish, "")}</span>
            <span><strong>${escapeHtml(dish.name)}</strong><small>${escapeHtml((dish.tags || []).join(" / ") || "未加标签")}</small></span>
          </button>
        `).join("") : `<p class="muted">还没有符合标签的菜谱。</p>`}
      </div>
      <div class="sheet-actions">
        <button class="secondary-pill" type="button" data-action="clear-meal-slot">清空这个餐位</button>
      </div>
    </section>
  `;
}

function renderShoppingList() {
  const list = buildShoppingList({
    weeklyPlan: state.weeklyPlan,
    dishes: state.dishes,
    shoppingState: state.shoppingState,
  });

  app.innerHTML = `
    <section class="page-title shopping-title">
      <button class="round-icon-button" type="button" data-view="weekly" aria-label="返回">‹</button>
      <div>
        <h2>本周食材采购清单</h2>
        <p class="soft-label">已汇总本周所有餐次的食材，可手动修改、补充、勾选已采购。</p>
      </div>
    </section>

    <section class="shopping-list">
      ${list.length ? list.map(renderShoppingGroup).join("") : `
        <div class="empty-state">
          <img src="./assets/food-doodles.png" alt="">
          <p>本周还没安排菜谱，先回去选几道想吃的。</p>
        </div>
      `}
    </section>

    <form class="custom-ingredient-form" data-form="custom-ingredient">
      <h3>添加自定义食材</h3>
      <input name="name" maxlength="24" placeholder="比如：葱姜">
      <input name="quantity" maxlength="24" placeholder="数量：适量">
      <select name="category">
        <option value="蔬菜类">蔬菜类</option>
        <option value="肉蛋禽类">肉蛋禽类</option>
        <option value="主食干货">主食干货</option>
        <option value="调料辅料" selected>调料辅料</option>
      </select>
      <button class="secondary-pill" type="submit">+ 添加自定义食材</button>
    </form>

    <div class="fixed-action-bar">
      <button class="primary-pill" type="button" data-action="copy-shopping-list">一键复制清单</button>
    </div>
  `;
}

function estimateCookMeta(steps = []) {
  const stepCount = Math.max(1, steps.length || 1);
  const minutes = Math.min(60, Math.max(10, stepCount * 5));
  const difficulty = stepCount <= 3 ? "简单" : stepCount <= 6 ? "适中" : "费时";
  return `约 ${minutes} 分钟 · ${difficulty}`;
}

function syncStatusText() {
  if (state.settings.cloudSyncEnabled && hasCloudConfig(state.settings)) {
    return navigator.onLine ? "已同步至云端" : "联网后自动同步";
  }
  return "仅保存在本机";
}

function renderMyLegacy() {
  const cloudReady = hasCloudConfig(state.settings);
  app.innerHTML = `
    <section class="page-title my-title">
      <p class="soft-label">我的菜单小本</p>
      <h2>我的</h2>
    </section>

    <section class="section-block my-card">
      <div class="section-heading"><h3>⚙️ 设置与偏好</h3><p>${cloudReady ? "云同步已配置" : "云同步未配置"}</p></div>
      <form class="editor-form compact-form" data-form="settings">
        <label>
          <span>DeepSeek API Key</span>
          <input name="apiKey" type="password" value="${escapeAttr(state.settings.apiKey || "")}" placeholder="只保存在本机浏览器">
        </label>
        <label>
          <span>DeepSeek 模型</span>
          <input name="model" value="${escapeAttr(state.settings.model || DEFAULT_SETTINGS.model)}" placeholder="deepseek-v4-flash">
        </label>
        <label>
          <span>默认随机范围</span>
          <select name="defaultRandomScope">
            <option value="all" ${state.settings.defaultRandomScope === "all" ? "selected" : ""}>全部菜谱</option>
            <option value="favorites" ${state.settings.defaultRandomScope === "favorites" ? "selected" : ""}>只从收藏</option>
          </select>
        </label>
        <button class="primary-pill" type="submit">保存 DeepSeek 设置</button>
      </form>
      <form class="editor-form compact-form" data-form="cloud">
        <label>
          <span>Supabase URL</span>
          <input name="cloudUrl" value="${escapeAttr(state.settings.cloudUrl || "")}" placeholder="https://xxxx.supabase.co">
        </label>
        <label>
          <span>Supabase anon key</span>
          <input name="cloudAnonKey" type="password" value="${escapeAttr(state.settings.cloudAnonKey || "")}" placeholder="只保存在本机浏览器">
        </label>
        <label>
          <span>同步空间</span>
          <input name="syncSpace" value="${escapeAttr(state.settings.syncSpace || DEFAULT_SETTINGS.syncSpace)}" placeholder="default-menu">
        </label>
        <label class="check-row">
          <input name="cloudSyncEnabled" type="checkbox" ${state.settings.cloudSyncEnabled ? "checked" : ""}>
          <span>保存菜谱后自动同步云端</span>
        </label>
        <button class="primary-pill" type="submit">保存云同步设置</button>
      </form>
      <div class="action-row cloud-actions">
        <button class="secondary-pill" type="button" data-action="cloud-push">上传到云端</button>
        <button class="secondary-pill" type="button" data-action="cloud-pull">从云端拉取</button>
      </div>
      <p class="hint">不同手机填写同一组 Supabase URL、anon key 和同步空间，就会看到同一份菜谱。</p>
    </section>

    <section class="section-block my-card">
      <div class="section-heading"><h3>📊 数据管理</h3><p>${state.dishes.length} 道菜</p></div>
      <div class="action-row">
        <button class="secondary-pill" type="button" data-action="export">导出备份</button>
        <label class="secondary-pill import-button">导入备份<input type="file" accept="application/json" data-input="import"></label>
      </div>
      <p class="hint">导出的文件不包含 DeepSeek Key 和云同步 anon key，适合换设备或后续放进 git 仓库保管。</p>
      <div class="my-danger-row">
        <button class="danger-pill" type="button" data-action="clear-data">清空本地数据</button>
      </div>
    </section>

    <section class="section-block my-card">
      <div class="section-heading"><h3>❓ 帮助与反馈</h3><p>轻量说明</p></div>
      <p class="hint">菜谱、周计划和采购清单会优先保存在本机；开启云同步后，同一同步空间下的手机会自动看到同一份数据。</p>
      <p class="hint">如果页面没有更新，可以先打开刷新页清理缓存，再回到首页。</p>
    </section>
  `;
}

function renderHome() {
  const tags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])].slice(0, 8);
  const recent = [...state.dishes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const favorites = state.dishes.filter((dish) => dish.favorite).slice(0, 3);
  const pick = currentPick || state.dishes[0] || null;

  app.innerHTML = `
    <section class="hero-panel home-hero-panel">
      <div class="hero-copy hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">
        <p class="soft-label">今天想吃点什么？</p>
        <h2>${pick ? escapeHtml(pick.name) : "先记录一道喜欢的菜"}</h2>
        <p>${pick ? escapeHtml(shortRecipe(pick.recipe)) : "把常吃的、想吃的都收进来，之后就交给随机按钮。"}</p>
      </div>
      <div class="doodle-frame hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">
        ${dishImage(pick, "今日推荐插画")}
      </div>
      <div class="tag-row hero-open-target" role="button" tabindex="0" data-action="view-current-pick" data-id="${escapeAttr(pick?.id || "")}">
        ${renderTags(pick?.tags || ["凉爽的", "方便下饭"])}
      </div>
      <div class="hero-filter">
        <div class="section-heading">
          <h3>按心情挑标签</h3>
          <button class="text-button" type="button" data-action="clear-tags">清空</button>
        </div>
        <div class="chip-cloud">
          ${tags.map((tag) => `
            <button class="tag-chip ${selectedTags.includes(tag) ? "is-selected" : ""}" type="button" data-action="toggle-home-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
          `).join("")}
        </div>
        ${selectedTags.length ? `<p class="hero-filter-summary">当前筛选：${selectedTags.map(escapeHtml).join("、")}</p>` : ""}
      </div>

      <div class="action-row">
        <button class="primary-pill" type="button" data-action="random">随机一道</button>
        <button class="secondary-pill" type="button" data-action="ai-current">AI 推荐做法</button>
      </div>
    </section>

    <section class="weekly-entry">
      <button type="button" data-view="weekly">
        <span>📅 一周菜谱计划</span>
        <small>安排每日三餐｜一键汇总食材清单</small>
      </button>
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

function getMostUsedTag() {
  const counts = new Map();
  for (const tag of state.dishes.flatMap((dish) => dish.tags || [])) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "还没有";
}

function getPlannedMealCount() {
  return Object.values(state.weeklyPlan?.slots || {})
    .flatMap((meals) => Object.values(meals || {}))
    .filter(Boolean).length;
}

function renderMy() {
  const cloudReady = hasCloudConfig(state.settings);
  const favoriteCount = state.dishes.filter((dish) => dish.favorite).length;
  const allTags = [...new Set([...DEFAULT_TAGS, ...getAllTags(state.dishes)])];

  app.innerHTML = `
    <section class="page-title my-title">
      <p class="soft-label">我的菜单小本</p>
      <h2>我的</h2>
    </section>

    <section class="my-section">
      <p class="my-section-label">常用入口</p>
      <button class="my-action-card" type="button" data-view="library" data-favorites="true">
        <span>⭐ 我的收藏菜谱</span>
        <small>查看你标记过的喜欢的菜</small>
      </button>
      <button class="my-action-card" type="button" data-view="weekly">
        <span>📅 本周菜谱计划</span>
        <small>查看/修改你的一周三餐安排</small>
      </button>
      <button class="my-action-card" type="button" data-view="shopping">
        <span>🛒 我的采购清单</span>
        <small>查看之前生成过的食材清单</small>
      </button>
    </section>

    <section class="my-section">
      <p class="my-section-label">数据与统计</p>
      <article class="my-info-card">
        <span>📊 我的做饭小统计</span>
        <div class="my-stat-grid">
          <b>${state.dishes.length}<small>道菜</small></b>
          <b>${favoriteCount}<small>收藏</small></b>
          <b>${getPlannedMealCount()}<small>餐</small></b>
        </div>
        <small>最常用标签：${escapeHtml(getMostUsedTag())}</small>
      </article>

      <details class="my-panel-card">
        <summary>
          <span>💾 菜谱备份与恢复</span>
          <small>导出/导入你的所有菜谱数据</small>
        </summary>
        <div class="action-row my-panel-actions">
          <button class="secondary-pill" type="button" data-action="export">导出备份</button>
          <label class="secondary-pill import-button">导入备份<input type="file" accept="application/json" data-input="import"></label>
        </div>
        <p class="hint">备份不包含 DeepSeek Key 和云同步 anon key，适合换设备或自己留档。</p>
        <div class="my-danger-row">
          <button class="danger-pill" type="button" data-action="clear-data">清空本地数据</button>
        </div>
      </details>
    </section>

    <section class="my-section">
      <p class="my-section-label">设置与偏好</p>
      <details class="my-panel-card">
        <summary>
          <span>⚙️ 设置与偏好</span>
          <small>API 配置、云同步、随机范围</small>
        </summary>
        <form class="editor-form compact-form" data-form="settings">
          <label>
            <span>DeepSeek API Key</span>
            <input name="apiKey" type="password" value="${escapeAttr(state.settings.apiKey || "")}" placeholder="只保存在本机浏览器">
          </label>
          <label>
            <span>DeepSeek 模型</span>
            <input name="model" value="${escapeAttr(state.settings.model || DEFAULT_SETTINGS.model)}" placeholder="deepseek-v4-flash">
          </label>
          <label>
            <span>默认随机范围</span>
            <select name="defaultRandomScope">
              <option value="all" ${state.settings.defaultRandomScope === "all" ? "selected" : ""}>全部菜谱</option>
              <option value="favorites" ${state.settings.defaultRandomScope === "favorites" ? "selected" : ""}>只从收藏</option>
            </select>
          </label>
          <button class="primary-pill" type="submit">保存 DeepSeek 设置</button>
        </form>

        <form class="editor-form compact-form" data-form="cloud">
          <label>
            <span>Supabase URL</span>
            <input name="cloudUrl" value="${escapeAttr(state.settings.cloudUrl || "")}" placeholder="https://xxxx.supabase.co">
          </label>
          <label>
            <span>Supabase anon key</span>
            <input name="cloudAnonKey" type="password" value="${escapeAttr(state.settings.cloudAnonKey || "")}" placeholder="只保存在本机浏览器">
          </label>
          <label>
            <span>同步空间</span>
            <input name="syncSpace" value="${escapeAttr(state.settings.syncSpace || DEFAULT_SETTINGS.syncSpace)}" placeholder="default-menu">
          </label>
          <label class="check-row">
            <input name="cloudSyncEnabled" type="checkbox" ${state.settings.cloudSyncEnabled ? "checked" : ""}>
            <span>保存菜谱后自动同步云端</span>
          </label>
          <button class="primary-pill" type="submit">保存云同步设置</button>
        </form>
        <div class="action-row cloud-actions">
          <button class="secondary-pill" type="button" data-action="cloud-push">上传到云端</button>
          <button class="secondary-pill" type="button" data-action="cloud-pull">从云端拉取</button>
        </div>
        <p class="hint">${cloudReady ? "云同步已配置。" : "云同步未配置。"}同一同步空间下的手机会看到同一份菜谱、周计划和采购清单。</p>
      </details>

      <details class="my-panel-card">
        <summary>
          <span>🏷️ 标签管理</span>
          <small>查看你的常用标签，编辑菜谱时可调整</small>
        </summary>
        <div class="chip-cloud my-tag-cloud">
          ${allTags.map((tag) => `<span class="tag-dot">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <p class="hint">当前标签来自菜谱本身。新增、删除或修改标签时，进入对应菜谱编辑页调整即可。</p>
      </details>
    </section>
  `;
}

function renderDishCards(dishes) {
  if (!dishes.length) {
    return `<div class="empty-state"><img src="./assets/food-doodles.png" alt=""><p>还没有符合条件的菜。</p></div>`;
  }

  return dishes.map((dish) => `
    <article class="dish-card" role="button" tabindex="0" data-action="view-dish" data-id="${escapeAttr(dish.id)}">
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
    <button class="dish-row" type="button" data-action="view-dish" data-id="${escapeAttr(dish.id)}">
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

function randomPick(options = {}) {
  const filters = { tags: selectedTags };
  if (state.settings.defaultRandomScope === "favorites") {
    filters.favoriteOnly = true;
  }
  currentPick = pickRandomDish(state.dishes, Math.random, filters);
  if (!currentPick) {
    showToast("没有符合条件的菜，换个标签试试。");
    return;
  }
  if (options.openDetail) {
    setView("detail", { detailId: currentPick.id, returnView: "library" });
    return;
  }
  activeView = "home";
  document.querySelector(".app-shell")?.classList.remove("is-detail-view");
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

function isDataImage(value) {
  return /^data:image\//i.test(String(value || ""));
}

async function uploadPendingDishImage(dishId, input) {
  if (!isDataImage(input.image)) {
    return input;
  }

  showToast("正在上传图片到云端。");
  try {
    const uploaded = await uploadDishImage({
      settings: state.settings,
      dishId,
      dataUrl: input.image,
    });
    showToast("图片已保存到云端。");
    return {
      ...input,
      image: uploaded.image,
      imagePath: uploaded.imagePath,
    };
  } catch (error) {
    throw friendlyUploadError(error);
  }
}

function saveDishFromFormLegacy(form) {
  const image = form.elements.image.value;
  const previousDishes = [...state.dishes];
  const previousPick = currentPick;
  const previousDetailId = detailId;
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
    detailId = state.dishes[index].id;
    showToast("这道菜已经更新。");
  } else {
    const dish = createDish(input);
    state.dishes.unshift(dish);
    currentPick = dish;
    showToast("已经收进菜谱。");
  }

  if (!persist({ sync: true })) {
    state.dishes = previousDishes;
    currentPick = previousPick;
    detailId = previousDetailId;
    return;
  }

  showToast(editingId ? "这道菜已经更新。" : "已经收进菜谱。");
  setView(editingId && editorReturnView === "detail" ? "detail" : "home", { detailId });
}

async function saveDishFromForm(form) {
  const previousDishes = [...state.dishes];
  const previousPick = currentPick;
  const previousDetailId = detailId;
  const baseInput = {
    name: form.elements.name.value,
    recipe: form.elements.recipe.value,
    ingredients: parseIngredientInput(form.elements.ingredients?.value || ""),
    videoUrl: form.elements.videoUrl?.value || "",
    tags: splitTags(form.elements.tags.value),
    image: form.elements.image.value,
    imagePath: form.elements.imagePath?.value || "",
    favorite: form.elements.favorite.checked,
  };

  try {
    if (editingId) {
      const index = state.dishes.findIndex((dish) => dish.id === editingId);
      const input = await uploadPendingDishImage(editingId, baseInput);
      state.dishes[index] = updateDish(state.dishes[index], input);
      currentPick = state.dishes[index];
      detailId = state.dishes[index].id;
    } else {
      let dish = createDish(baseInput);
      const input = await uploadPendingDishImage(dish.id, baseInput);
      dish = updateDish(dish, input);
      state.dishes.unshift(dish);
      currentPick = dish;
      detailId = dish.id;
    }

    if (!persist({ sync: true })) {
      state.dishes = previousDishes;
      currentPick = previousPick;
      detailId = previousDetailId;
      return;
    }

    showToast(editingId ? "这道菜已经更新。" : "已经收进菜谱。");
    setView(editingId && editorReturnView === "detail" ? "detail" : "home", { detailId });
  } catch (error) {
    state.dishes = previousDishes;
    currentPick = previousPick;
    detailId = previousDetailId;
    throw error;
  }
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
      state.weeklyPlan = normalizeWeeklyPlan(backup.weeklyPlan);
      state.shoppingState = normalizeShoppingState(backup.shoppingState);
    } else {
      const existingIds = new Set(state.dishes.map((dish) => dish.id));
      state.dishes = [...backup.dishes.filter((dish) => !existingIds.has(dish.id)), ...state.dishes];
      state.weeklyPlan = normalizeWeeklyPlan(backup.weeklyPlan);
      state.shoppingState = normalizeShoppingState(backup.shoppingState);
    }
    state.settings = {
      ...state.settings,
      ...backup.settings,
      apiKey: state.settings.apiKey,
      cloudUrl: state.settings.cloudUrl,
      cloudAnonKey: state.settings.cloudAnonKey,
      syncSpace: state.settings.syncSpace,
      cloudSyncEnabled: state.settings.cloudSyncEnabled,
    };
    persist({ sync: true });
    showToast("备份已经导入。");
    render();
  } catch (error) {
    showToast(error.message || "备份文件无法导入。");
  }
}

function readImageFileLegacy(input) {
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("图片读取失败，请换一张图片试试。")));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("图片无法读取，请换一张图片试试。")));
    image.src = dataUrl;
  });
}

function getCompressedSize(width, height) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= IMAGE_MAX_EDGE) {
    return { width, height, scaled: false };
  }
  const ratio = IMAGE_MAX_EDGE / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

async function compressImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const size = getCompressedSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return { dataUrl: originalDataUrl, compressed: false };
  }

  context.drawImage(image, 0, 0, size.width, size.height);
  const compressedDataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  const dataUrl = compressedDataUrl.length < originalDataUrl.length ? compressedDataUrl : originalDataUrl;
  if (dataUrl.length > IMAGE_MAX_DATA_URL_LENGTH) {
    throw new Error("这张图还是太大，请换一张更小的图片。");
  }

  return {
    dataUrl,
    compressed: size.scaled || dataUrl.length < originalDataUrl.length,
  };
}

async function readImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const result = await compressImageFile(file);
    const form = input.closest("form");
    form.elements.image.value = result.dataUrl;
    if (form.elements.imagePath) {
      form.elements.imagePath.value = "";
    }
    const preview = form.querySelector(".image-preview");
    preview.innerHTML = `<img src="${escapeAttr(result.dataUrl)}" alt="菜品图片预览">`;
    if (result.compressed) {
      showToast("图片太大，已自动压缩，保存时上传到云端。");
    } else {
      showToast("图片已选好，保存时上传到云端。");
    }
  } catch (error) {
    input.value = "";
    showToast(error.message || "图片处理失败，请换一张图片试试。");
  }
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

function closeMealPicker() {
  mealPicker = { open: false, day: "", meal: "", tags: [] };
}

function updateShoppingOverride(key, field, value) {
  state.shoppingState = normalizeShoppingState(state.shoppingState);
  const list = buildShoppingList({
    weeklyPlan: state.weeklyPlan,
    dishes: state.dishes,
    shoppingState: state.shoppingState,
  });
  const item = list.flatMap((group) => group.items).find((entry) => entry.key === key);
  if (!item || item.custom) return;

  state.shoppingState.overrides[key] = {
    name: field === "name" ? value.trim() : item.name,
    quantity: field === "quantity" ? value.trim() : item.quantityText,
    category: item.category,
  };
  persist({ sync: true });
}

function updateCustomItem(id, field, value) {
  state.shoppingState = normalizeShoppingState(state.shoppingState);
  state.shoppingState.customItems = state.shoppingState.customItems.map((item) => (
    item.id === id
      ? { ...item, [field === "quantity" ? "quantity" : "name"]: value.trim() }
      : item
  )).filter((item) => item.name);
  persist({ sync: true });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, label, [data-view], [data-action]");
  if (!target) return;

  const view = target.dataset.view;
  if (view) {
    if (view === "library") {
      favoriteOnly = Boolean(target.dataset.favorites);
    }
    setView(view);
    return;
  }

  const action = target.dataset.action;
  if (!action) return;

  if (action === "go-settings") setView("my");
  if (action === "random") randomPick();
  if (action === "view-dish") setView("detail", { detailId: target.dataset.id, returnView: activeView });
  if (action === "view-current-pick" && currentPick) {
    setView("detail", { detailId: target.dataset.id || currentPick.id, returnView: "home" });
  }
  if (action === "detail-back") setView(detailReturnView || "library");
  if (action === "detail-list") setView("library");
  if (action === "detail-random") randomPick({ openDetail: true });
  if (action === "detail-tag") {
    selectedTags = [target.dataset.tag].filter(Boolean);
    favoriteOnly = false;
    searchQuery = "";
    setView("library");
  }
  if (action === "weekly-back-home") {
    closeMealPicker();
    setView("home");
  }
  if (action === "open-meal-picker") {
    mealPicker = {
      open: true,
      day: target.dataset.day,
      meal: target.dataset.meal,
      tags: [],
    };
    render();
  }
  if (action === "close-meal-picker") {
    closeMealPicker();
    render();
  }
  if (action === "toggle-picker-tag") {
    const tag = target.dataset.tag;
    mealPicker.tags = mealPicker.tags.includes(tag)
      ? mealPicker.tags.filter((item) => item !== tag)
      : [...mealPicker.tags, tag];
    render();
  }
  if (action === "select-meal-dish") {
    state.weeklyPlan = setWeeklyMeal(state.weeklyPlan, mealPicker.day, mealPicker.meal, target.dataset.id);
    closeMealPicker();
    persist({ sync: true });
    render();
  }
  if (action === "clear-meal-slot") {
    state.weeklyPlan = clearWeeklyMeal(state.weeklyPlan, mealPicker.day, mealPicker.meal);
    closeMealPicker();
    persist({ sync: true });
    render();
  }
  if (action === "reset-weekly-plan") {
    if (confirm("确定要清空本周早午晚餐计划吗？")) {
      state.weeklyPlan = createEmptyWeeklyPlan();
      state.shoppingState = createEmptyShoppingState();
      persist({ sync: true });
      render();
    }
  }
  if (action === "reset-weekly-plan-v2") {
    if (confirm("确定要清空本周所有餐次安排吗？")) {
      state.weeklyPlan = createEmptyWeeklyPlan();
      state.shoppingState = createEmptyShoppingState();
      persist({ sync: true });
      render();
    }
  }
  if (action === "open-shopping-list") {
    setView("shopping");
  }
  if (action === "copy-shopping-list") {
    const text = copyShoppingListText(buildShoppingList({
      weeklyPlan: state.weeklyPlan,
      dishes: state.dishes,
      shoppingState: state.shoppingState,
    }));
    if (!text) {
      showToast("清单还是空的，先安排几道菜吧。");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("采购清单已复制。");
    } catch {
      showToast("复制失败，可以手动选中文本复制。");
    }
  }
  if (action === "delete-custom-item") {
    state.shoppingState = normalizeShoppingState(state.shoppingState);
    state.shoppingState.customItems = state.shoppingState.customItems.filter((item) => item.id !== target.dataset.id);
    persist({ sync: true });
    render();
  }
  if (action === "open-image") {
    document.querySelector("[data-lightbox]")?.removeAttribute("hidden");
  }
  if (action === "close-image") {
    document.querySelector("[data-lightbox]")?.setAttribute("hidden", "");
  }
  if (action === "clear-tags") {
    selectedTags = [];
    render();
  }
  if (action === "toggle-home-tag") toggleTag(target.dataset.tag);
  if (action === "toggle-favorite-filter") {
    favoriteOnly = !favoriteOnly;
    render();
  }
  if (action === "edit-dish") setView("editor", { editingId: target.dataset.id, returnView: activeView === "detail" ? "detail" : "home" });
  if (action === "toggle-favorite") {
    const dish = state.dishes.find((item) => item.id === target.dataset.id);
    dish.favorite = !dish.favorite;
    dish.updatedAt = new Date().toISOString();
    persist({ sync: true });
    render();
  }
  if (action === "delete-dish") {
    if (confirm("确定要删除这道菜谱吗？")) {
      state.dishes = state.dishes.filter((dish) => dish.id !== target.dataset.id);
      for (const day of Object.keys(state.weeklyPlan.slots || {})) {
        for (const meal of Object.keys(state.weeklyPlan.slots[day] || {})) {
          if (state.weeklyPlan.slots[day][meal] === target.dataset.id) {
            state.weeklyPlan = clearWeeklyMeal(state.weeklyPlan, day, meal);
          }
        }
      }
      persist({ sync: true });
      setView(activeView === "detail" ? (detailReturnView || "library") : "library");
    }
  }
  if (action === "ai-current" && currentPick) {
    await runAiRecipe(currentPick.name, currentPick.tags, (text) => {
      currentPick.recipe = text;
      currentPick.updatedAt = new Date().toISOString();
      persist({ sync: true });
      renderHome();
    });
  }
  if (action === "ai-dish") {
    const dish = state.dishes.find((item) => item.id === target.dataset.id);
    await runAiRecipe(dish.name, dish.tags, (text) => {
      dish.recipe = text;
      dish.updatedAt = new Date().toISOString();
      persist({ sync: true });
      render();
    });
  }
  if (action === "ai-form") await fillAiRecipeForForm();
  if (action === "cloud-push") await pushCloudNow();
  if (action === "cloud-pull") await pullCloudNow();
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
  if (event.target.dataset.shoppingField) {
    const key = event.target.dataset.key;
    if (key?.startsWith("custom:")) {
      updateCustomItem(key.replace("custom:", ""), event.target.dataset.shoppingField, event.target.value);
    } else {
      updateShoppingOverride(key, event.target.dataset.shoppingField, event.target.value);
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-input='import']")) {
    importBackup(event.target.files?.[0]);
  }
  if (event.target.matches("[data-shopping-check]")) {
    const key = event.target.dataset.shoppingCheck;
    state.shoppingState = normalizeShoppingState(state.shoppingState);
    if (key.startsWith("custom:")) {
      const id = key.replace("custom:", "");
      state.shoppingState.customItems = state.shoppingState.customItems.map((item) => (
        item.id === id ? { ...item, checked: event.target.checked } : item
      ));
    } else {
      state.shoppingState.checked[key] = event.target.checked;
    }
    persist({ sync: true });
    render();
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target.closest("[data-action='view-dish'], [data-action='view-current-pick']");
  if (!target || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }
  event.preventDefault();
  const detailTargetId = target.dataset.id || currentPick?.id;
  if (detailTargetId) {
    setView("detail", { detailId: detailTargetId, returnView: activeView });
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;

  if (form.dataset.form === "dish") {
    try {
      await saveDishFromForm(form);
    } catch (error) {
      showToast(error.message || friendlyErrorMessage(error));
    }
  }

  if (form.dataset.form === "settings") {
    state.settings = {
      ...state.settings,
      apiKey: form.elements.apiKey.value.trim(),
      aiProvider: "deepseek",
      model: form.elements.model.value.trim() || DEFAULT_SETTINGS.model,
      defaultRandomScope: form.elements.defaultRandomScope.value,
    };
    persist();
    showToast("DeepSeek 设置已保存。");
  }

  if (form.dataset.form === "cloud") {
    state.settings = {
      ...state.settings,
      cloudUrl: form.elements.cloudUrl.value.trim(),
      cloudAnonKey: form.elements.cloudAnonKey.value.trim(),
      syncSpace: form.elements.syncSpace.value.trim() || DEFAULT_SETTINGS.syncSpace,
      cloudSyncEnabled: form.elements.cloudSyncEnabled.checked,
    };
    persist();
    showToast("云同步设置已保存。");
  }

  if (form.dataset.form === "custom-ingredient") {
    const name = form.elements.name.value.trim();
    if (!name) {
      showToast("先写一个食材名。");
      return;
    }
    state.shoppingState = normalizeShoppingState(state.shoppingState);
    state.shoppingState.customItems.push({
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      quantity: form.elements.quantity.value.trim() || "适量",
      category: form.elements.category.value,
      checked: false,
    });
    persist({ sync: true });
    showToast("已加入采购清单。");
    render();
  }
});

async function pushCloudNow() {
  try {
    showToast("正在上传到云端。");
    await pushCloudState(state);
    showToast("云端已经更新。");
  } catch (error) {
    showToast(error.message || "上传云端失败。");
  }
}

async function pullCloudNow() {
  try {
    showToast("正在读取云端菜谱。");
    const cloudState = await pullCloudState({ settings: state.settings });
    if (!cloudState) {
      showToast("云端暂时还没有菜谱，先上传一次。");
      return;
    }

    state.dishes = cloudState.dishes;
    state.weeklyPlan = normalizeWeeklyPlan(cloudState.weeklyPlan);
    state.shoppingState = normalizeShoppingState(cloudState.shoppingState);
    state.settings = {
      ...state.settings,
      ...cloudState.settings,
      apiKey: state.settings.apiKey,
      cloudUrl: state.settings.cloudUrl,
      cloudAnonKey: state.settings.cloudAnonKey,
      syncSpace: state.settings.syncSpace,
      cloudSyncEnabled: state.settings.cloudSyncEnabled,
    };
    currentPick = state.dishes[0] || null;
    persist();
    showToast("已从云端更新本机菜谱。");
    render();
  } catch (error) {
    showToast(error.message || "读取云端失败。");
  }
}

function latestDishTimestamp(dishes = []) {
  return dishes.reduce((latest, dish) => {
    const updatedAt = Date.parse(dish.updatedAt || dish.createdAt || "");
    return Number.isFinite(updatedAt) ? Math.max(latest, updatedAt) : latest;
  }, 0);
}

async function pullCloudOnStartup() {
  if (!state.settings.cloudSyncEnabled || !hasCloudConfig(state.settings)) {
    return;
  }

  try {
    const cloudState = await pullCloudState({ settings: state.settings });
    if (!cloudState) {
      return;
    }

    const cloudSyncedAt = Date.parse(cloudState.syncedAt || "");
    const localLatest = latestDishTimestamp(state.dishes);
    if (Number.isFinite(cloudSyncedAt) && localLatest > cloudSyncedAt) {
      return;
    }

    state.dishes = cloudState.dishes;
    state.weeklyPlan = normalizeWeeklyPlan(cloudState.weeklyPlan);
    state.shoppingState = normalizeShoppingState(cloudState.shoppingState);
    state.settings = {
      ...state.settings,
      ...cloudState.settings,
      apiKey: state.settings.apiKey,
      cloudUrl: state.settings.cloudUrl,
      cloudAnonKey: state.settings.cloudAnonKey,
      syncSpace: state.settings.syncSpace,
      cloudSyncEnabled: state.settings.cloudSyncEnabled,
    };
    currentPick = state.dishes[0] || null;
    persist();
    render();
  } catch (error) {
    console.warn("Cloud startup sync skipped", error);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw-ui-polish-v1.js");
  });
}

render();
pullCloudOnStartup();
