export const SAVE_KEY = "xiaoxiaodeta-save-v1";
export const LEGACY_STATS_KEY = "xiaoxiaodeta-stats";
export const SAVE_VERSION = 3;

export const FOOD_ITEMS = Object.freeze([
  { id: "biscuit", name: "奶油小饼干", icon: "🍪", price: 2, satiety: 25 },
  { id: "cake", name: "莓莓小蛋糕", icon: "🍰", price: 5, satiety: 40 },
  { id: "strawberry-cake", name: "草莓奶油蛋糕", icon: "🍓", price: 9, satiety: 60 },
]);

export const COSMETIC_ITEMS = Object.freeze([
  { id: "default", name: "日常白裙", icon: "♡", type: "outfit", price: 0, affection: 0, outfit: "default" },
  { id: "outfit-rose", name: "樱花茶会", icon: "🌸", type: "outfit", price: 4, affection: 35, outfit: "rose" },
  { id: "outfit-sky", name: "晴空散步", icon: "☁", type: "outfit", price: 6, affection: 55, outfit: "sky" },
  { id: "outfit-moon", name: "月光庆典", icon: "✦", type: "outfit", price: 8, affection: 80, outfit: "moon" },
  { id: "outfit-strawberry", name: "草莓奶油裙", icon: "🍓", type: "outfit", price: 10, affection: 40, outfit: "strawberry" },
  { id: "outfit-winter", name: "暖冬毛绒衣", icon: "❄", type: "outfit", price: 12, affection: 50, outfit: "winter" },
  { id: "outfit-sailor", name: "海风水手服", icon: "⚓", type: "outfit", price: 14, affection: 60, outfit: "sailor" },
  { id: "outfit-wizard", name: "星月魔法裙", icon: "✧", type: "outfit", price: 16, affection: 70, outfit: "wizard" },
  { id: "outfit-sunset", name: "晚霞野餐裙", icon: "🌷", type: "outfit", price: 18, affection: 85, outfit: "sunset" },
  { id: "ribbon", name: "初遇蝴蝶结", icon: "🎀", type: "accessory", slot: "head", price: 0, affection: 0, accessory: "ribbon" },
  { id: "star-crown", name: "星星发箍", icon: "✦", type: "accessory", slot: "head", price: 3, affection: 35, accessory: "star-crown" },
  { id: "flower-aura", name: "花朵发夹", icon: "✿", type: "accessory", slot: "head", price: 3, affection: 50, accessory: "flower-aura" },
  { id: "heart-bag", name: "心心斜挎包", icon: "♡", type: "accessory", slot: "prop", price: 4, affection: 65, accessory: "heart-bag" },
  { id: "cloud-scarf", name: "奶油云朵围巾", icon: "☁", type: "accessory", slot: "neck", price: 4, affection: 80, accessory: "cloud-scarf" },
  { id: "kitty-headband", name: "软软猫耳发箍", icon: "⌁", type: "accessory", slot: "head", price: 7, affection: 40, accessory: "kitty-headband" },
  { id: "moon-hairpin", name: "月亮珍珠发夹", icon: "☾", type: "accessory", slot: "head", price: 8, affection: 48, accessory: "moon-hairpin" },
  { id: "round-glasses", name: "奶油圆框眼镜", icon: "◎", type: "accessory", slot: "head", price: 10, affection: 58, accessory: "round-glasses" },
  { id: "sunflower-crown", name: "小雏菊花冠", icon: "✿", type: "accessory", slot: "head", price: 11, affection: 68, accessory: "sunflower-crown" },
  { id: "berry-choker", name: "莓果小项链", icon: "♥", type: "accessory", slot: "neck", price: 7, affection: 42, accessory: "berry-choker" },
  { id: "pearl-necklace", name: "珍珠星星项链", icon: "✧", type: "accessory", slot: "neck", price: 9, affection: 60, accessory: "pearl-necklace" },
  { id: "cloud-plush", name: "云朵肩头伙伴", icon: "☁", type: "accessory", slot: "prop", price: 8, affection: 52, accessory: "cloud-plush" },
  { id: "star-wand", name: "星星魔法棒", icon: "✦", type: "accessory", slot: "prop", price: 10, affection: 66, accessory: "star-wand" },
  { id: "strawberry-purse", name: "草莓小挎包", icon: "🍓", type: "accessory", slot: "prop", price: 12, affection: 75, accessory: "strawberry-purse" },
  { id: "heart-cape", name: "软心心披肩", icon: "♡", type: "accessory", slot: "prop", price: 14, affection: 88, accessory: "heart-cape" },
]);

export const ACCESSORY_SLOTS = Object.freeze([
  { id: "head", name: "头部" },
  { id: "neck", name: "颈部" },
  { id: "prop", name: "肩挂" },
]);

export const DAILY_TASKS = [
  { id: "care", label: "照顾一下她", goal: 1, rewardXp: 12, rewardTokens: 1 },
  { id: "interactions", label: "完成 3 次互动", goal: 3, rewardXp: 18, rewardTokens: 2 },
  { id: "starHunt", label: "找到今天的星星", goal: 1, rewardXp: 20, rewardTokens: 2 },
  { id: "focus", label: "完成一段专注", goal: 1, rewardXp: 25, rewardTokens: 3 },
];

export const WEEKLY_TASKS = [
  { id: "weeklyInteractions", label: "本周互动 10 次", goal: 10, rewardXp: 45, rewardTokens: 5 },
  { id: "weeklyFocus", label: "本周完成 3 次专注", goal: 3, rewardXp: 60, rewardTokens: 7 },
  { id: "weeklyCheckins", label: "本周签到 4 天", goal: 4, rewardXp: 50, rewardTokens: 5 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function previousLocalDateKey(date = new Date()) {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
}

export function localWeekKey(date = new Date()) {
  const weekday = date.getDay() || 7;
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday + 1));
}

function makeEmptySave() {
  return {
    version: SAVE_VERSION,
    stats: { affection: 18, energy: 76, streak: 0, lastCheckIn: "" },
    currencies: { tokens: 3, stars: 0 },
    needs: { satiety: 50, activeMillis: 0 },
    inventory: { foods: { biscuit: 1, cake: 0, "strawberry-cake": 0 } },
    progression: {
      xp: 0,
      level: 1,
      badges: [],
      actionCollection: [],
      collection: ["default"],
      equipped: { outfit: "default", accessories: { head: "none", neck: "none", prop: "none" } },
    },
    games: { starCatch: { bestScore: 0, bestCombo: 0, totalPlays: 0, lastPlayed: "" } },
    totals: { checkins: 0, focusCompleted: 0, starHunts: 0, interactions: 0 },
    activity: {
      dailyKey: "",
      weeklyKey: "",
      daily: { care: 0, interactions: 0, starHunt: 0, focus: 0 },
      weekly: { weeklyInteractions: 0, weeklyFocus: 0, weeklyCheckins: 0 },
    },
    claims: [],
  };
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseObject(raw) {
  if (raw && typeof raw === "object") return safeObject(raw);
  if (typeof raw !== "string" || !raw.trim()) return {};
  try { return safeObject(JSON.parse(raw)); } catch { return {}; }
}

function normalizeEquipped(raw, collection) {
  const source = safeObject(raw);
  const legacy = typeof raw === "string" ? raw : "";
  const outfit = typeof source.outfit === "string" ? source.outfit : "default";
  const sourceAccessories = safeObject(source.accessories);
  const legacyAccessory = typeof source.accessory === "string" ? source.accessory : "none";
  if (legacy && legacy !== "default") {
    const item = COSMETIC_ITEMS.find((entry) => entry.id === legacy);
    if (item?.type === "accessory") return normalizeEquipped({ outfit: "default", accessory: item.id }, collection);
    if (item?.type === "outfit") return { outfit: item.outfit, accessories: { head: "none", neck: "none", prop: "none" } };
  }
  const outfitItem = COSMETIC_ITEMS.find((item) => item.type === "outfit" && item.outfit === outfit);
  const accessoryIds = Object.fromEntries(ACCESSORY_SLOTS.map(({ id }) => {
    const candidate = typeof sourceAccessories[id] === "string" ? sourceAccessories[id] : "none";
    const item = COSMETIC_ITEMS.find((entry) => entry.id === candidate && entry.type === "accessory" && entry.slot === id);
    return [id, item && collection.includes(item.id) ? item.id : "none"];
  }));
  const legacyItem = COSMETIC_ITEMS.find((item) => item.id === legacyAccessory && item.type === "accessory");
  if (legacyItem && collection.includes(legacyItem.id) && accessoryIds[legacyItem.slot] === "none") {
    accessoryIds[legacyItem.slot] = legacyItem.id;
  }
  return {
    outfit: outfit === "default" || (outfitItem && collection.includes(outfitItem.id)) ? outfit : "default",
    accessories: accessoryIds,
  };
}

function normalizeSave(input, now = new Date()) {
  const defaults = makeEmptySave();
  const value = safeObject(input);
  const stats = safeObject(value.stats);
  const currencies = safeObject(value.currencies);
  const needs = safeObject(value.needs);
  const inventory = safeObject(value.inventory);
  const foods = safeObject(inventory.foods);
  const progression = safeObject(value.progression);
  const totals = safeObject(value.totals);
  const activity = safeObject(value.activity);
  const games = safeObject(value.games);
  const starCatch = safeObject(games.starCatch);
  const daily = safeObject(activity.daily);
  const weekly = safeObject(activity.weekly);
  const badges = Array.isArray(progression.badges) ? [...new Set(progression.badges.filter((id) => typeof id === "string"))] : [];
  const actionCollection = Array.isArray(progression.actionCollection)
    ? [...new Set(progression.actionCollection.filter((id) => typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id)))].slice(-64)
    : [];
  const collection = Array.isArray(progression.collection)
    ? [...new Set(["default", ...progression.collection.filter((id) => typeof id === "string")])]
    : ["default"];
  const xp = clamp(progression.xp, 0, 10_000_000);
  return {
    version: SAVE_VERSION,
    stats: {
      affection: clamp(stats.affection ?? defaults.stats.affection, 0, 100),
      energy: clamp(stats.energy ?? defaults.stats.energy, 0, 100),
      streak: clamp(stats.streak ?? defaults.stats.streak, 0, 100_000),
      lastCheckIn: typeof stats.lastCheckIn === "string" ? stats.lastCheckIn : "",
    },
    currencies: {
      tokens: clamp(currencies.tokens ?? 0, 0, 1_000_000),
      stars: clamp(currencies.stars ?? stats.coins ?? 0, 0, 1_000_000),
    },
    needs: {
      satiety: clamp(needs.satiety ?? defaults.needs.satiety, 0, 100),
      activeMillis: clamp(needs.activeMillis, 0, 599_999),
    },
    inventory: {
      foods: Object.fromEntries(FOOD_ITEMS.map((food) => [food.id, clamp(foods[food.id] ?? 0, 0, 100_000)])),
    },
    progression: {
      xp,
      level: Math.floor(xp / 100) + 1,
      badges,
      actionCollection,
      collection,
      equipped: normalizeEquipped(progression.equipped, collection),
    },
    games: {
      starCatch: {
        bestScore: clamp(starCatch.bestScore, 0, 180),
        bestCombo: clamp(starCatch.bestCombo, 0, 180),
        totalPlays: clamp(starCatch.totalPlays, 0, 1_000_000),
        lastPlayed: typeof starCatch.lastPlayed === "string" ? starCatch.lastPlayed : "",
      },
    },
    totals: {
      checkins: clamp(totals.checkins, 0, 1_000_000),
      focusCompleted: clamp(totals.focusCompleted, 0, 1_000_000),
      starHunts: clamp(totals.starHunts, 0, 1_000_000),
      interactions: clamp(totals.interactions, 0, 10_000_000),
      focusSessions: Array.isArray(totals.focusSessions) ? [...new Set(totals.focusSessions.filter((id) => typeof id === "string"))].slice(-200) : [],
    },
    activity: {
      dailyKey: typeof activity.dailyKey === "string" ? activity.dailyKey : localDateKey(now),
      weeklyKey: typeof activity.weeklyKey === "string" ? activity.weeklyKey : localWeekKey(now),
      daily: Object.fromEntries(Object.keys(defaults.activity.daily).map((key) => [key, clamp(daily[key], 0, 100_000)])),
      weekly: Object.fromEntries(Object.keys(defaults.activity.weekly).map((key) => [key, clamp(weekly[key], 0, 100_000)])),
    },
    claims: Array.isArray(value.claims) ? [...new Set(value.claims.filter((id) => typeof id === "string"))].slice(-400) : [],
  };
}

export function migrateSave(versionedRaw, legacyRaw = null, now = new Date()) {
  const versioned = parseObject(versionedRaw);
  if (versioned.version === SAVE_VERSION) return normalizeSave(versioned, now);
  if (Number(versioned.version) === 2) return normalizeSave({ ...versioned, version: SAVE_VERSION }, now);

  const legacyStats = safeObject(versioned.stats);
  const legacy = Object.keys(versioned).length ? versioned : parseObject(legacyRaw);
  const stats = Object.keys(legacyStats).length ? legacyStats : legacy;
  const base = makeEmptySave();
  base.stats = {
    affection: clamp(stats.affection ?? base.stats.affection, 0, 100),
    energy: clamp(stats.energy ?? base.stats.energy, 0, 100),
    streak: clamp(stats.streak ?? base.stats.streak, 0, 100_000),
    lastCheckIn: typeof stats.lastCheckIn === "string" ? stats.lastCheckIn : "",
  };
  base.currencies = {
    tokens: 3,
    stars: clamp(versioned.currencies?.stars ?? stats.coins ?? base.currencies.stars, 0, 1_000_000),
  };

  if (Number(versioned.version) === 1) {
    const source = safeObject(versioned.progression);
    const collection = Array.isArray(source.collection) ? source.collection : ["default"];
    base.progression = {
      ...base.progression,
      xp: clamp(source.xp, 0, 10_000_000),
      level: Math.floor(clamp(source.xp, 0, 10_000_000) / 100) + 1,
      badges: Array.isArray(source.badges) ? source.badges : [],
      collection,
      equipped: source.equipped || "default",
    };
    base.totals = { ...base.totals, ...safeObject(versioned.totals) };
    base.activity = { ...base.activity, ...safeObject(versioned.activity) };
    base.claims = Array.isArray(versioned.claims) ? versioned.claims : [];
  }
  base.inventory.foods.biscuit = 1;
  base.needs.satiety = 50;
  base.activity.dailyKey = localDateKey(now);
  base.activity.weeklyKey = localWeekKey(now);
  return normalizeSave(base, now);
}

export function rollActivityPeriods(input, now = new Date()) {
  const save = normalizeSave(input, now);
  const day = localDateKey(now);
  const week = localWeekKey(now);
  if (save.activity.dailyKey !== day) {
    save.activity.dailyKey = day;
    save.activity.daily = { care: 0, interactions: 0, starHunt: 0, focus: 0 };
  }
  if (save.activity.weeklyKey !== week) {
    save.activity.weeklyKey = week;
    save.activity.weekly = { weeklyInteractions: 0, weeklyFocus: 0, weeklyCheckins: 0 };
  }
  return save;
}

function grantTask(save, task, period, periodKey, completed) {
  const claimKey = `${period}:${periodKey}:${task.id}`;
  if (save.claims.includes(claimKey)) return;
  save.claims.push(claimKey);
  save.currencies.tokens = clamp(save.currencies.tokens + task.rewardTokens, 0, 1_000_000);
  save.progression.xp += task.rewardXp;
  completed.push(task.id);
}

function updateUnlocks(save) {
  const levelUnlocks = [
    [2, "ribbon"],
    [4, "star-crown"],
    [6, "flower-aura"],
  ];
  const newlyUnlocked = [];
  for (const [requiredLevel, id] of levelUnlocks) {
    if (save.progression.level >= requiredLevel && !save.progression.collection.includes(id)) {
      save.progression.collection.push(id);
      newlyUnlocked.push(id);
    }
  }
  const badgeRules = [
    ["first-checkin", save.totals.checkins >= 1],
    ["focus-partner", save.totals.focusCompleted >= 1],
    ["star-seeker", save.totals.starHunts >= 1],
    ["familiar-days", save.totals.interactions >= 50],
    ["week-together", save.stats.streak >= 7],
  ];
  for (const [id, qualifies] of badgeRules) {
    if (qualifies && !save.progression.badges.includes(id)) save.progression.badges.push(id);
  }
  save.progression.level = Math.floor(save.progression.xp / 100) + 1;
  for (const [requiredLevel, id] of levelUnlocks) {
    if (save.progression.level >= requiredLevel && !save.progression.collection.includes(id)) {
      save.progression.collection.push(id);
      newlyUnlocked.push(id);
    }
  }
  return newlyUnlocked;
}

function countInteraction(save, { care = false, focus = false } = {}) {
  if (care) save.activity.daily.care = 1;
  if (focus) save.activity.daily.focus = 1;
  else save.activity.daily.interactions += 1;
  save.activity.weekly.weeklyInteractions += 1;
  save.totals.interactions += 1;
}

function finishEvent(save, result, now) {
  for (const task of DAILY_TASKS) {
    if (save.activity.daily[task.id] >= task.goal) grantTask(save, task, "daily", save.activity.dailyKey, result.completed);
  }
  for (const task of WEEKLY_TASKS) {
    if (save.activity.weekly[task.id] >= task.goal) grantTask(save, task, "weekly", save.activity.weeklyKey, result.completed);
  }
  result.unlocked = updateUnlocks(save);
  result.save = normalizeSave(save, now);
  result.applied = true;
  return result;
}

export function applyProgressEvent(input, event, now = new Date()) {
  const save = rollActivityPeriods(input, now);
  const type = typeof event === "string" ? event : event?.type;
  const result = { save, applied: false, completed: [], unlocked: [], reason: "" };
  if (!type) return result;
  if (type === "action") return result;

  if (type === "satietyTick") {
    const elapsed = clamp(event?.elapsedMs, 0, 60_000);
    if (!elapsed) return result;
    const activeMillis = save.needs.activeMillis + elapsed;
    const consumed = Math.floor(activeMillis / 600_000);
    save.needs.satiety = clamp(save.needs.satiety - consumed, 0, 100);
    save.needs.activeMillis = activeMillis % 600_000;
    return { ...result, save: normalizeSave(save, now), applied: true };
  }

  if (type === "checkin") {
    const today = localDateKey(now);
    if (save.stats.lastCheckIn === today) return result;
    const yesterday = previousLocalDateKey(now);
    save.stats.streak = save.stats.lastCheckIn === yesterday ? save.stats.streak + 1 : Math.max(1, save.stats.lastCheckIn ? 1 : save.stats.streak);
    save.stats.lastCheckIn = today;
    save.stats.affection = clamp(save.stats.affection + 2, 0, 100);
    save.currencies.tokens += 1;
    save.totals.checkins += 1;
    save.activity.weekly.weeklyCheckins += 1;
    save.progression.xp += 5;
  } else if (type === "buyFood") {
    const food = FOOD_ITEMS.find((item) => item.id === event?.foodId);
    if (!food) return { ...result, reason: "没有找到这份食物。" };
    if (save.currencies.tokens < food.price) return { ...result, reason: "代币不够，再完成几个小目标就能买啦。" };
    save.currencies.tokens -= food.price;
    save.inventory.foods[food.id] += 1;
  } else if (type === "feed") {
    const food = FOOD_ITEMS.find((item) => item.id === event?.foodId)
      || FOOD_ITEMS.find((item) => save.inventory.foods[item.id] > 0);
    if (save.needs.satiety >= 75) return { ...result, reason: "她已经吃饱啦，等一会儿再喂吧。" };
    if (!food || save.inventory.foods[food.id] < 1) return { ...result, reason: "背包里没有食物，先去小商店买一点吧。" };
    save.inventory.foods[food.id] -= 1;
    save.needs.satiety = clamp(save.needs.satiety + food.satiety, 0, 100);
    save.stats.energy = clamp(save.stats.energy + 10, 0, 100);
    save.stats.affection = clamp(save.stats.affection + 1, 0, 100);
    if (!save.progression.actionCollection.includes("feed")) save.progression.actionCollection.push("feed");
    countInteraction(save, { care: true });
  } else if (type === "pet" || type === "hug" || type === "chat" || type === "wish" || type === "action" || type === "rpsLose" || type === "rpsDraw") {
    if (type === "wish") {
      const wishKey = `wish:${localDateKey(now)}`;
      if (save.claims.includes(wishKey)) return result;
      save.claims.push(wishKey);
      save.currencies.tokens += 1;
      save.stats.affection = clamp(save.stats.affection + 1, 0, 100);
    } else if (type === "pet" || type === "hug") {
      save.stats.affection = clamp(save.stats.affection + 2, 0, 100);
      save.stats.energy = clamp(save.stats.energy + 1, 0, 100);
      if (!save.progression.actionCollection.includes(type)) save.progression.actionCollection.push(type);
    } else if (type === "chat") {
      save.stats.affection = clamp(save.stats.affection + 1, 0, 100);
    }
    if (type !== "action") countInteraction(save, { care: ["pet", "hug", "chat"].includes(type) });
  } else if (type === "starGameComplete") {
    const claimKey = `star-game:${localDateKey(now)}`;
    if (save.claims.includes(claimKey)) return result;
    save.claims.push(claimKey);
    save.currencies.stars += 3;
    save.stats.affection = clamp(save.stats.affection + 3, 0, 100);
    save.totals.starHunts += 1;
    save.activity.daily.starHunt = 1;
    countInteraction(save);
    save.progression.xp += 20;
  } else if (type === "memoryGameComplete") {
    const claimKey = `memory-game:${localDateKey(now)}`;
    if (save.claims.includes(claimKey)) return result;
    save.claims.push(claimKey);
    save.currencies.stars += 2;
    save.stats.affection = clamp(save.stats.affection + 2, 0, 100);
    save.progression.xp += 15;
    countInteraction(save);
  } else if (type === "focusComplete") {
    const sessionId = typeof event?.sessionId === "string" ? event.sessionId.slice(0, 120) : "";
    if (sessionId && save.totals.focusSessions.includes(sessionId)) return result;
    if (sessionId) save.totals.focusSessions.push(sessionId);
    save.stats.affection = clamp(save.stats.affection + 4, 0, 100);
    save.currencies.tokens += 2;
    save.totals.focusCompleted += 1;
    save.activity.daily.focus = 1;
    save.activity.weekly.weeklyFocus += 1;
    save.progression.xp += 25;
  } else if (type === "rpsWin") {
    const claimKey = `rps-win:${localDateKey(now)}`;
    if (save.claims.includes(claimKey)) return result;
    save.claims.push(claimKey);
    save.currencies.stars += 1;
    save.stats.affection = clamp(save.stats.affection + 2, 0, 100);
    countInteraction(save);
  } else if (type === "starCatchComplete") {
    const sessionId = typeof event?.sessionId === "string" ? event.sessionId.slice(0, 120) : "";
    const score = Math.floor(clamp(event?.score, 0, 180));
    if (!sessionId || save.claims.includes(`star-catch-session:${sessionId}`)) return result;
    save.claims.push(`star-catch-session:${sessionId}`);
    save.games.starCatch.totalPlays += 1;
    save.games.starCatch.bestScore = Math.max(save.games.starCatch.bestScore, score);
    save.games.starCatch.bestCombo = Math.max(save.games.starCatch.bestCombo, Math.floor(clamp(event?.bestCombo, 0, score)));
    save.games.starCatch.lastPlayed = localDateKey(now);
    const dailyClaim = `star-catch:${localDateKey(now)}`;
    if (score >= 5 && !save.claims.includes(dailyClaim)) {
      save.claims.push(dailyClaim);
      save.currencies.stars += 1;
      save.progression.xp += 12;
      save.stats.affection = clamp(save.stats.affection + 1, 0, 100);
      countInteraction(save);
      result.rewardGranted = true;
    }
  } else if (type === "actionCollect") {
    const actionId = typeof event?.actionId === "string" ? event.actionId.slice(0, 80) : "";
    if (!/^[a-z0-9-]{1,80}$/.test(actionId) || save.progression.actionCollection.includes(actionId)) return result;
    save.progression.actionCollection.push(actionId);
  } else if (type === "buyCosmetic") {
    const item = COSMETIC_ITEMS.find((entry) => entry.id === event?.itemId);
    if (!item) return { ...result, reason: "没有找到这件装扮。" };
    if (save.progression.collection.includes(item.id)) return { ...result, reason: "这件装扮已经在收藏里啦。" };
    if (save.stats.affection < item.affection) return { ...result, reason: `亲密度达到 ${item.affection} 后就能解锁。` };
    if (save.currencies.stars < item.price) return { ...result, reason: "星星不够，再玩一轮小游戏吧。" };
    save.currencies.stars -= item.price;
    save.progression.collection.push(item.id);
  } else if (type === "grantCosmetic") {
    // Wardrobe variants the user hand-generates for their own custom pet are
    // theirs by right: no star price, no affection gate, no duplicate.
    const item = COSMETIC_ITEMS.find((entry) => entry.id === event?.itemId);
    if (!item) return { ...result, reason: "没有找到这件装扮。" };
    if (!save.progression.collection.includes(item.id)) save.progression.collection.push(item.id);
  } else if (type === "equip") {
    const itemId = event?.itemId;
    if (itemId === "none") {
      const slot = event?.slot;
      if (ACCESSORY_SLOTS.some((entry) => entry.id === slot)) save.progression.equipped.accessories[slot] = "none";
      else save.progression.equipped.accessories = { head: "none", neck: "none", prop: "none" };
    } else {
      const item = COSMETIC_ITEMS.find((entry) => entry.id === itemId);
      if (!item || !save.progression.collection.includes(item.id)) return result;
      if (item.type === "outfit") save.progression.equipped.outfit = item.outfit;
      else save.progression.equipped.accessories[item.slot] = item.id;
    }
  } else {
    return result;
  }

  return finishEvent(save, result, now);
}

export function loadSaveFromStorage(storage, now = new Date()) {
  const versionedRaw = storage.getItem(SAVE_KEY);
  const legacyRaw = storage.getItem(LEGACY_STATS_KEY);
  let parsed;
  try {
    parsed = versionedRaw ? JSON.parse(versionedRaw) : null;
  } catch {
    const backupKey = `${SAVE_KEY}.corrupt.${now.getTime()}`;
    try { storage.setItem(backupKey, versionedRaw); } catch { /* preserve fallback behavior */ }
    parsed = null;
  }
  const save = migrateSave(parsed, legacyRaw, now);
  storage.setItem(SAVE_KEY, JSON.stringify(save));
  return save;
}
