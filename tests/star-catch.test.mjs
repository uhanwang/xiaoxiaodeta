import assert from "node:assert/strict";
import test from "node:test";
import { catchStar, createStarCatchGame, starCatchDailyReward, tickStarCatchGame } from "../src/starCatch.js";
import { applyProgressEvent, migrateSave } from "../src/progression.js";

test("star targets stay within the play field and only the active target can be caught", () => {
  const game = createStarCatchGame(1234);
  assert.equal(game.active, true);
  assert.ok(game.target.x >= 8 && game.target.x <= 92);
  assert.ok(game.target.y >= 8 && game.target.y <= 78);
  assert.equal(catchStar(game, game.target.id + 1), game);
  const caught = catchStar(game, game.target.id);
  assert.equal(caught.score, 1);
  assert.equal(caught.combo, 1);
  assert.notEqual(caught.target.id, game.target.id);
});

test("every fifth consecutive catch adds a small combo bonus, and the timer stops cleanly", () => {
  let game = createStarCatchGame(42);
  for (let index = 0; index < 5; index += 1) game = catchStar(game, game.target.id);
  assert.equal(game.score, 6);
  assert.equal(game.bestCombo, 5);
  for (let index = 0; index < 29; index += 1) game = tickStarCatchGame(game);
  assert.equal(game.timeLeft, 1);
  game = tickStarCatchGame(game);
  assert.equal(game.timeLeft, 0);
  assert.equal(game.active, false);
  assert.equal(tickStarCatchGame(game), game);
});

test("daily star catch award requires five catches and is idempotent per local day and session", () => {
  const dayOne = new Date(2026, 8, 25, 12);
  let save = migrateSave(null, null, dayOne);
  assert.equal(starCatchDailyReward(4), false);
  assert.equal(starCatchDailyReward(5), true);
  const first = applyProgressEvent(save, { type: "starCatchComplete", sessionId: "round-a", score: 5, bestCombo: 5 }, dayOne);
  assert.equal(first.applied, true);
  assert.equal(first.rewardGranted, true);
  assert.equal(first.save.currencies.stars, save.currencies.stars + 1);
  assert.equal(first.save.games.starCatch.bestScore, 5);

  const replay = applyProgressEvent(first.save, { type: "starCatchComplete", sessionId: "round-a", score: 60, bestCombo: 10 }, dayOne);
  assert.equal(replay.applied, false);
  assert.equal(replay.save.currencies.stars, first.save.currencies.stars);

  const second = applyProgressEvent(first.save, { type: "starCatchComplete", sessionId: "round-b", score: 6, bestCombo: 6 }, dayOne);
  assert.equal(second.applied, true);
  assert.equal(second.rewardGranted, undefined);
  assert.equal(second.save.currencies.stars, first.save.currencies.stars);
  assert.equal(second.save.games.starCatch.totalPlays, first.save.games.starCatch.totalPlays + 1);

  const nextDay = applyProgressEvent(second.save, { type: "starCatchComplete", sessionId: "round-c", score: 5, bestCombo: 5 }, new Date(2026, 8, 26, 0, 1));
  assert.equal(nextDay.rewardGranted, true);
  assert.equal(nextDay.save.currencies.stars, second.save.currencies.stars + 1);
});
