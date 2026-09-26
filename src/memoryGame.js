export const MEMORY_PAIRS = Object.freeze([
  { id: "heart", face: "♡", label: "爱心" },
  { id: "star", face: "✦", label: "星星" },
  { id: "moon", face: "☾", label: "月亮" },
  { id: "flower", face: "✿", label: "花朵" },
  { id: "cloud", face: "☁", label: "云朵" },
  { id: "sparkle", face: "✧", label: "星光" },
]);

export function createMemoryGame(random = Math.random) {
  const cards = MEMORY_PAIRS.flatMap((pair) => [pair.id, pair.id]);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const sample = Number(random());
    const swapIndex = Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(sample) ? sample : 0)) * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return {
    cards: cards.map((pairId, id) => ({ id, pairId, faceUp: false, matched: false })),
    opened: [],
    matchedPairs: 0,
    moves: 0,
    locked: false,
    complete: false,
  };
}

export function flipMemoryCard(game, index) {
  if (!game || game.complete || game.locked || !Number.isInteger(index) || index < 0 || index >= game.cards.length) return game;
  const card = game.cards[index];
  if (card.faceUp || card.matched) return game;

  const cards = game.cards.map((item, itemIndex) => itemIndex === index ? { ...item, faceUp: true } : item);
  if (game.opened.length === 0) return { ...game, cards, opened: [index] };

  const firstIndex = game.opened[0];
  if (game.cards[firstIndex].pairId === card.pairId) {
    const matchedCards = cards.map((item, itemIndex) => itemIndex === firstIndex || itemIndex === index
      ? { ...item, faceUp: true, matched: true }
      : item);
    const matchedPairs = game.matchedPairs + 1;
    return {
      ...game,
      cards: matchedCards,
      opened: [],
      matchedPairs,
      moves: game.moves + 1,
      complete: matchedPairs === MEMORY_PAIRS.length,
    };
  }

  return { ...game, cards, opened: [...game.opened, index], moves: game.moves + 1, locked: true };
}

export function hideMemoryMismatch(game) {
  if (!game?.locked || game.opened.length !== 2) return game;
  const opened = new Set(game.opened);
  return {
    ...game,
    cards: game.cards.map((card, index) => opened.has(index) && !card.matched ? { ...card, faceUp: false } : card),
    opened: [],
    locked: false,
  };
}
