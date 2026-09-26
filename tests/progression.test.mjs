import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProgressEvent,
  localDateKey,
  localWeekKey,
  loadSaveFromStorage,
  migrateSave,
  rollActivityPeriods,
} from "../src/progression.js";

test("date keys follow the local calendar and weeks start on Monday", () => {
  const sunday = new Date(2026, 8, 27, 23, 59, 59);
  assert.equal(localDateKey(sunday), "2026-09-27");
  assert.equal(localWeekKey(sunday), "2026-09-21");
  assert.equal(localWeekKey(new Date(2026, 8, 28, 0, 0, 1)), "2026-09-28");
});

test("version 1 coins migrate to stars and all existing progress survives", () => {
  const now = new Date(2026, 8, 24, 10);
  const old = {
    version: 1,
    stats: { affection: 42, energy: 31, coins: 9, streak: 5, lastCheckIn: "2026-09-23" },
    progression: { xp: 240, badges: ["first-checkin"], collection: ["default", "ribbon"], equipped: "ribbon" },
    totals: { checkins: 3, focusCompleted: 2, starHunts: 1, interactions: 24 },
    activity: { dailyKey: "2026-09-24", weeklyKey: "2026-09-21", daily: { interactions: 2 }, weekly: { weeklyFocus: 1 } },
    claims: ["memory-game:2026-09-24"],
  };
  const save = migrateSave(old, null, now);
  assert.equal(save.version, 3);
  assert.deepEqual(save.stats, { affection: 42, energy: 31, streak: 5, lastCheckIn: "2026-09-23" });
  assert.deepEqual(save.currencies, { tokens: 3, stars: 9 });
  assert.equal(save.needs.satiety, 50);
  assert.equal(save.inventory.foods.biscuit, 1);
  assert.equal(save.progression.level, 3);
  assert.equal(save.progression.equipped.accessories.head, "ribbon");
  assert.ok(save.progression.collection.includes("ribbon"));
  assert.equal(save.totals.interactions, 24);
  assert.ok(save.claims.includes("memory-game:2026-09-24"));
});

test("version 2 migration preserves the current balance, collection, equipment, and game records", () => {
  const now = new Date(2026, 8, 25, 10);
  const current = {
    version: 2,
    stats: { affection: 73, energy: 61, streak: 8, lastCheckIn: "2026-09-24" },
    currencies: { tokens: 6, stars: 22 },
    needs: { satiety: 47, activeMillis: 240_000 },
    inventory: { foods: { biscuit: 0, cake: 2, "strawberry-cake": 1 } },
    progression: {
      xp: 315,
      badges: ["first-checkin"],
      collection: ["default", "ribbon", "outfit-rose", "heart-bag", "cloud-scarf"],
      equipped: { outfit: "rose", accessory: "ribbon" },
    },
    totals: { checkins: 8, focusCompleted: 3, starHunts: 2, interactions: 37 },
    activity: {
      dailyKey: "2026-09-25", weeklyKey: "2026-09-21",
      daily: { care: 1, interactions: 2, starHunt: 1, focus: 0 },
      weekly: { weeklyInteractions: 7, weeklyFocus: 1, weeklyCheckins: 2 },
    },
    claims: ["star-game:2026-09-24", "memory-game:2026-09-25"],
  };
  const save = migrateSave(current, null, now);
  assert.equal(save.version, 3);
  assert.equal(save.currencies.stars, 22);
  assert.equal(save.currencies.tokens, 6);
  assert.equal(save.needs.satiety, 47);
  assert.equal(save.inventory.foods.cake, 2);
  assert.equal(save.progression.xp, 315);
  assert.equal(save.progression.equipped.outfit, "rose");
  assert.deepEqual(save.progression.equipped.accessories, { head: "ribbon", neck: "none", prop: "none" });
  assert.equal(save.totals.interactions, 37);
  assert.equal(save.activity.daily.interactions, 2);
  assert.ok(save.claims.includes("memory-game:2026-09-25"));
});

test("wardrobe contains eight purchasable outfits, fifteen accessories, and three independent slots", async () => {
  const { COSMETIC_ITEMS, ACCESSORY_SLOTS } = await import("../src/progression.js");
  assert.equal(COSMETIC_ITEMS.filter((item) => item.type === "outfit").length, 9); // includes the default look
  assert.equal(COSMETIC_ITEMS.filter((item) => item.type === "outfit" && item.id !== "default").length, 8);
  assert.equal(COSMETIC_ITEMS.filter((item) => item.type === "accessory").length, 15);
  assert.deepEqual(ACCESSORY_SLOTS.map((slot) => slot.id), ["head", "neck", "prop"]);
});

test("daily and weekly task token rewards are fixed and claimed only once", () => {
  const now = new Date(2026, 8, 24, 12);
  let save = migrateSave(null, null, now);
  save = applyProgressEvent(save, { type: "feed", foodId: "biscuit" }, now).save;
  assert.equal(save.activity.daily.care, 1);
  save = applyProgressEvent(save, "pet", now).save;
  const result = applyProgressEvent(save, "hug", now);
  save = result.save;
  assert.ok(result.completed.includes("interactions"));
  const tokensAfterTasks = save.currencies.tokens;
  for (let i = 0; i < 7; i += 1) save = applyProgressEvent(save, "pet", now).save;
  const tokensAfterWeeklyTask = save.currencies.tokens;
  const xpAfterWeeklyTask = save.progression.xp;
  assert.equal(tokensAfterWeeklyTask, tokensAfterTasks + 5);
  for (let i = 0; i < 4; i += 1) save = applyProgressEvent(save, "pet", now).save;
  assert.equal(save.claims.filter((key) => key.endsWith(":care")).length, 1);
  assert.equal(save.claims.filter((key) => key.endsWith(":interactions")).length, 1);
  assert.equal(save.currencies.tokens, tokensAfterWeeklyTask);
  assert.equal(save.progression.xp, xpAfterWeeklyTask);
});

test("check-in rewards are idempotent and the streak uses local calendar days", () => {
  const yesterday = new Date(2026, 8, 23, 23, 55);
  const today = new Date(2026, 8, 24, 0, 5);
  let save = migrateSave(null, JSON.stringify({ streak: 4, lastCheckIn: localDateKey(yesterday), coins: 10 }), today);
  let result = applyProgressEvent(save, "checkin", today);
  assert.equal(result.save.stats.streak, 5);
  assert.equal(result.save.currencies.stars, 10);
  assert.equal(result.save.currencies.tokens, 4);
  save = result.save;
  result = applyProgressEvent(save, "checkin", today);
  assert.equal(result.applied, false);
  assert.equal(result.save.currencies.tokens, 4);

  const missedDay = new Date(2026, 8, 26, 0, 1);
  assert.equal(applyProgressEvent(save, "checkin", missedDay).save.stats.streak, 1);
});

test("feeding consumes inventory and respects satiety while purchasing food uses tokens", () => {
  const now = new Date(2026, 8, 24, 10);
  let save = migrateSave(null, null, now);
  const fed = applyProgressEvent(save, { type: "feed", foodId: "biscuit" }, now);
  assert.equal(fed.applied, true);
  assert.equal(fed.save.needs.satiety, 75);
  assert.equal(fed.save.inventory.foods.biscuit, 0);
  assert.ok(fed.save.progression.actionCollection.includes("feed"));
  const tooFull = applyProgressEvent(fed.save, { type: "feed", foodId: "biscuit" }, now);
  assert.equal(tooFull.applied, false);
  assert.match(tooFull.reason, /吃饱/);
  assert.equal(tooFull.save.inventory.foods.biscuit, 0);

  let hungry = fed.save;
  for (let minute = 0; minute < 10; minute += 1) hungry = applyProgressEvent(hungry, { type: "satietyTick", elapsedMs: 60_000 }, now).save;
  assert.equal(hungry.needs.satiety, 74);
  assert.equal(hungry.needs.activeMillis, 0);
  const bought = applyProgressEvent(hungry, { type: "buyFood", foodId: "biscuit" }, now);
  assert.equal(bought.applied, true);
  assert.equal(bought.save.currencies.tokens, 2);
  assert.equal(bought.save.inventory.foods.biscuit, 1);
  const secondFed = applyProgressEvent(bought.save, { type: "feed", foodId: "biscuit" }, now);
  assert.equal(secondFed.applied, true);
  assert.equal(secondFed.save.needs.satiety, 99);
});

test("satiety only advances through active-app ticks and pauses across an unreported closed interval", () => {
  const start = new Date(2026, 8, 24, 8);
  let save = migrateSave(null, null, start);
  for (let minute = 0; minute < 9; minute += 1) save = applyProgressEvent(save, { type: "satietyTick", elapsedMs: 60_000 }, start).save;
  assert.equal(save.needs.satiety, 50);
  assert.equal(save.needs.activeMillis, 540_000);
  const afterClosedHours = migrateSave(save, null, new Date(2026, 8, 24, 18));
  assert.equal(afterClosedHours.needs.satiety, 50);
  const nextMinute = applyProgressEvent(afterClosedHours, { type: "satietyTick", elapsedMs: 60_000 }, new Date(2026, 8, 24, 18));
  assert.equal(nextMinute.save.needs.satiety, 49);
  assert.equal(nextMinute.save.needs.activeMillis, 0);
});

test("memory game stars and experience can be claimed once per local day", () => {
  const today = new Date(2026, 8, 24, 23, 59);
  const before = migrateSave(null, null, today);
  const first = applyProgressEvent(before, "memoryGameComplete", today);
  assert.equal(first.applied, true);
  assert.equal(first.save.currencies.stars, before.currencies.stars + 2);
  assert.equal(first.save.stats.affection, before.stats.affection + 2);
  assert.equal(first.save.progression.xp, before.progression.xp + 15);
  assert.equal(first.save.totals.interactions, before.totals.interactions + 1);

  const duplicate = applyProgressEvent(first.save, "memoryGameComplete", new Date(2026, 8, 24, 23, 59, 59));
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.save.currencies.stars, first.save.currencies.stars);
  assert.equal(duplicate.save.progression.xp, first.save.progression.xp);

  const nextDay = applyProgressEvent(first.save, "memoryGameComplete", new Date(2026, 8, 25, 0, 1));
  assert.equal(nextDay.applied, true);
  assert.equal(nextDay.save.currencies.stars, first.save.currencies.stars + 2);
});

test("cosmetics enforce affection and star costs, then equip separate outfit and accessory slots", () => {
  const now = new Date(2026, 8, 24);
  let save = migrateSave(null, null, now);
  save.currencies.stars = 22;
  const locked = applyProgressEvent(save, { type: "buyCosmetic", itemId: "outfit-rose" }, now);
  assert.equal(locked.applied, false);
  assert.match(locked.reason, /亲密度/);

  save.stats.affection = 100;
  const bought = applyProgressEvent(save, { type: "buyCosmetic", itemId: "outfit-rose" }, now);
  assert.equal(bought.applied, true);
  assert.equal(bought.save.currencies.stars, 18);
  assert.ok(bought.save.progression.collection.includes("outfit-rose"));
  const duplicateBuy = applyProgressEvent(bought.save, { type: "buyCosmetic", itemId: "outfit-rose" }, now);
  assert.equal(duplicateBuy.applied, false);
  const dressed = applyProgressEvent(bought.save, { type: "equip", itemId: "outfit-rose" }, now);
  assert.equal(dressed.save.progression.equipped.outfit, "rose");
  const bagBought = applyProgressEvent(dressed.save, { type: "buyCosmetic", itemId: "heart-bag" }, now);
  const bagEquipped = applyProgressEvent(bagBought.save, { type: "equip", itemId: "heart-bag" }, now);
  assert.equal(bagEquipped.save.progression.equipped.outfit, "rose");
  assert.equal(bagEquipped.save.progression.equipped.accessories.prop, "heart-bag");
  const scarfBought = applyProgressEvent(bagEquipped.save, { type: "buyCosmetic", itemId: "cloud-scarf" }, now);
  const scarfEquipped = applyProgressEvent(scarfBought.save, { type: "equip", itemId: "cloud-scarf" }, now);
  assert.equal(scarfEquipped.save.progression.equipped.accessories.prop, "heart-bag");
  assert.equal(scarfEquipped.save.progression.equipped.accessories.neck, "cloud-scarf");
  const removed = applyProgressEvent(scarfEquipped.save, { type: "equip", itemId: "none", slot: "prop" }, now);
  assert.equal(removed.save.progression.equipped.accessories.prop, "none");
  assert.equal(removed.save.progression.equipped.accessories.neck, "cloud-scarf");
});

test("a new local day and Monday reset task progress without losing the save", () => {
  const thursday = new Date(2026, 8, 24, 18);
  let save = migrateSave(null, null, thursday);
  save = applyProgressEvent(save, "pet", thursday).save;
  const friday = new Date(2026, 8, 25, 0, 1);
  save = rollActivityPeriods(save, friday);
  assert.equal(save.activity.daily.interactions, 0);
  assert.equal(save.progression.xp, 12);
  const nextMonday = new Date(2026, 8, 28, 0, 1);
  save = applyProgressEvent(save, "checkin", nextMonday).save;
  assert.equal(save.activity.weekly.weeklyCheckins, 1);
  assert.equal(save.stats.lastCheckIn, "2026-09-28");
});

test("corrupt saves are preserved under a recovery key and defaults load", () => {
  const values = new Map([
    ["xiaoxiaodeta-save-v1", "{not json"],
    ["xiaoxiaodeta-stats", "{also broken"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const save = loadSaveFromStorage(storage, new Date(2026, 8, 24));
  assert.equal(save.version, 3);
  assert.equal(save.stats.affection, 18);
  assert.equal(save.currencies.tokens, 3);
  assert.ok([...values.entries()].some(([key, value]) => key.startsWith("xiaoxiaodeta-save-v1.corrupt.") && value === "{not json"));
  assert.equal(JSON.parse(values.get("xiaoxiaodeta-save-v1")).version, 3);
});

test("non-rewarding display actions do not write progression or award currency", () => {
  const save = migrateSave(null, null, new Date(2026, 8, 24));
  const action = applyProgressEvent(save, "action", new Date(2026, 8, 24));
  assert.equal(action.applied, false);
  assert.equal(action.save.currencies.tokens, save.currencies.tokens);
  assert.equal(action.save.currencies.stars, save.currencies.stars);
});

test("action collection records each offline motion once without granting currency", () => {
  const now = new Date(2026, 8, 25, 14);
  const save = migrateSave(null, null, now);
  const first = applyProgressEvent(save, { type: "actionCollect", actionId: "rps-scissors" }, now);
  assert.equal(first.applied, true);
  assert.deepEqual(first.save.progression.actionCollection, ["rps-scissors"]);
  assert.equal(first.save.currencies.stars, save.currencies.stars);
  assert.equal(first.save.currencies.tokens, save.currencies.tokens);
  const duplicate = applyProgressEvent(first.save, { type: "actionCollect", actionId: "rps-scissors" }, now);
  assert.equal(duplicate.applied, false);
  assert.deepEqual(duplicate.save.progression.actionCollection, ["rps-scissors"]);
  assert.equal(applyProgressEvent(first.save, { type: "actionCollect", actionId: "not valid" }, now).applied, false);
});
