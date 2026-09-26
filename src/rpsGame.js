export const RPS_CHOICES = Object.freeze([
  { id: "rock", label: "石头", icon: "✊", actionId: "rps-rock" },
  { id: "scissors", label: "剪刀", icon: "✌", actionId: "rps-scissors" },
  { id: "paper", label: "布", icon: "✋", actionId: "rps-paper" },
]);

const CHOICE_IDS = new Set(RPS_CHOICES.map((choice) => choice.id));

export function resolveRpsRound(playerChoice, petChoice) {
  if (!CHOICE_IDS.has(playerChoice) || !CHOICE_IDS.has(petChoice)) {
    throw new RangeError("猜拳只能选择石头、剪刀或布。");
  }

  const outcome = playerChoice === petChoice
    ? "draw"
    : (playerChoice === "rock" && petChoice === "scissors")
      || (playerChoice === "scissors" && petChoice === "paper")
      || (playerChoice === "paper" && petChoice === "rock")
      ? "win"
      : "lose";

  return {
    playerChoice,
    petChoice,
    outcome,
    actionId: RPS_CHOICES.find((choice) => choice.id === petChoice).actionId,
  };
}

export function randomRpsChoice(random = Math.random) {
  const index = Math.max(0, Math.min(RPS_CHOICES.length - 1, Math.floor(random() * RPS_CHOICES.length)));
  return RPS_CHOICES[index].id;
}
