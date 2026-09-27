// Prompt texts for the free "make it yours" guide. The user pastes these into
// any image-generation tool they like; the app only assembles the results.
import guide from "../shared/qpet-strips.json";

export const GUIDE = guide;

export function identityPrompt() {
  return guide.identity;
}

export function stripPromptText(spec) {
  const background = spec.background === "cyan"
    ? "纯青色（#00FFFF）均匀背景"
    : "纯白均匀背景";
  return `基于参考图中同一个 Q 版桌宠角色，重新绘制同一角色的「${spec.label}」动作精灵表。横向 ${spec.frames} 个完整不重叠的同一角色，角色大小和脚底基线完全一致，动作连续自然：${spec.action}。${background}，无阴影、无文字、无编号、无道具、无额外人物，适合逐格切分。`;
}
