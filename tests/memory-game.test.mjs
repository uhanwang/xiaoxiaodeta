import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryGame, flipMemoryCard, hideMemoryMismatch, MEMORY_PAIRS } from "../src/memoryGame.js";

test("memory game creates a shuffled 3 by 4 deck with six matching pairs", () => {
  const game = createMemoryGame(() => 0.37);
  assert.equal(game.cards.length, 12);
  assert.deepEqual([...new Set(game.cards.map((card) => card.pairId))].sort(), MEMORY_PAIRS.map(({ id }) => id).sort());
  for (const { id } of MEMORY_PAIRS) assert.equal(game.cards.filter((card) => card.pairId === id).length, 2);
  assert.equal(game.cards.filter((card, index) => card.pairId === MEMORY_PAIRS[Math.floor(index / 2)].id).length < 12, true);
});

test("matched cards stay open and a mismatch blocks input until it is hidden", () => {
  let game = createMemoryGame(() => 0.37);
  const indexesFor = (pairId) => game.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []);
  const [heartA, heartB] = indexesFor("heart");
  game = flipMemoryCard(game, heartA);
  assert.equal(game.moves, 0);
  const sameCard = flipMemoryCard(game, heartA);
  assert.equal(sameCard, game);
  game = flipMemoryCard(game, heartB);
  assert.equal(game.matchedPairs, 1);
  assert.ok(game.cards[heartA].matched && game.cards[heartB].matched);
  assert.equal(game.moves, 1);

  const [star] = indexesFor("star");
  const [moon] = indexesFor("moon");
  game = flipMemoryCard(game, star);
  game = flipMemoryCard(game, moon);
  assert.equal(game.locked, true);
  assert.equal(flipMemoryCard(game, heartA), game);
  game = hideMemoryMismatch(game);
  assert.equal(game.locked, false);
  assert.equal(game.cards[star].faceUp, false);
  assert.equal(game.cards[moon].faceUp, false);
  assert.equal(game.cards[heartA].matched, true);
});

test("a complete game is reached only after all six pairs match", () => {
  let game = createMemoryGame(() => 0.37);
  for (const { id } of MEMORY_PAIRS) {
    const indexes = game.cards.flatMap((card, index) => card.pairId === id ? [index] : []);
    game = flipMemoryCard(game, indexes[0]);
    game = flipMemoryCard(game, indexes[1]);
  }
  assert.equal(game.matchedPairs, 6);
  assert.equal(game.moves, 6);
  assert.equal(game.complete, true);
  assert.equal(game.cards.every((card) => card.matched && card.faceUp), true);
  assert.equal(flipMemoryCard(game, 0), game);
});
