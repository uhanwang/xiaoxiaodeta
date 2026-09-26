import assert from "node:assert/strict";
import test from "node:test";
import { RPS_CHOICES, randomRpsChoice, resolveRpsRound } from "../src/rpsGame.js";

test("all nine rock-paper-scissors combinations resolve and carry the pet gesture action", () => {
  const expected = {
    rock: { rock: "draw", scissors: "win", paper: "lose" },
    scissors: { rock: "lose", scissors: "draw", paper: "win" },
    paper: { rock: "win", scissors: "lose", paper: "draw" },
  };
  for (const playerChoice of RPS_CHOICES) {
    for (const petChoice of RPS_CHOICES) {
      const round = resolveRpsRound(playerChoice.id, petChoice.id);
      assert.equal(round.outcome, expected[playerChoice.id][petChoice.id]);
      assert.equal(round.actionId, petChoice.actionId);
      assert.equal(round.petChoice, petChoice.id);
    }
  }
});

test("invalid gesture IDs cannot silently become a game result", () => {
  assert.throws(() => resolveRpsRound("lizard", "rock"), RangeError);
});

test("random choice is deterministic at each boundary for testable rounds", () => {
  assert.equal(randomRpsChoice(() => 0), "rock");
  assert.equal(randomRpsChoice(() => 0.5), "scissors");
  assert.equal(randomRpsChoice(() => 0.999), "paper");
});
