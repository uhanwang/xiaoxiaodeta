const GAME_SECONDS = 30;
const MIN_DAILY_SCORE = 5;

function nextRandom(seed) {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function targetFor(seed, id) {
  const first = nextRandom(seed || 0x9e3779b9);
  const second = nextRandom(first || 0x85ebca6b);
  return {
    id,
    x: 8 + (first % 8400) / 100,
    y: 8 + (second % 7000) / 100,
  };
}

export function createStarCatchGame(seed = Date.now()) {
  const safeSeed = (Math.floor(Number(seed) || 1) >>> 0) || 1;
  return {
    active: true,
    timeLeft: GAME_SECONDS,
    score: 0,
    combo: 0,
    bestCombo: 0,
    seed: safeSeed,
    nextTargetId: 1,
    target: targetFor(safeSeed, 0),
  };
}

export function catchStar(game, targetId) {
  if (!game?.active || game.target?.id !== targetId) return game;
  const nextCombo = game.combo + 1;
  const targetIdNext = game.nextTargetId;
  return {
    ...game,
    score: game.score + 1 + (nextCombo % 5 === 0 ? 1 : 0),
    combo: nextCombo,
    bestCombo: Math.max(game.bestCombo, nextCombo),
    nextTargetId: targetIdNext + 1,
    target: targetFor(nextRandom(game.seed + targetIdNext), targetIdNext),
  };
}

export function tickStarCatchGame(game) {
  if (!game?.active) return game;
  const timeLeft = Math.max(0, game.timeLeft - 1);
  return { ...game, timeLeft, active: timeLeft > 0 };
}

export function starCatchDailyReward(score) {
  return Math.floor(Number(score) || 0) >= MIN_DAILY_SCORE;
}

export const STAR_CATCH_RULES = Object.freeze({ seconds: GAME_SECONDS, minimumDailyScore: MIN_DAILY_SCORE });
