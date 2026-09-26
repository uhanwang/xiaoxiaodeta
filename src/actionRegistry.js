export const ATLAS_URL = "./assets/atlas/pet-actions-installed.webp";
export const ATLAS = Object.freeze({ columns: 8, rows: 11, cellWidth: 192, cellHeight: 208 });

export const PET_ACTIONS = Object.freeze([
  { id: "idle", label: "待机呼吸", row: 0, frames: 7, loopMs: 1400, group: "陪伴" },
  { id: "run-right", label: "向右跑", row: 1, frames: 8, loopMs: 980, group: "移动" },
  { id: "run-left", label: "向左跑", row: 2, frames: 8, loopMs: 980, group: "移动" },
  { id: "wave", label: "挥手打招呼", row: 3, frames: 4, loopMs: 880, group: "回应" },
  { id: "jump", label: "开心跳跃", row: 4, frames: 5, loopMs: 820, group: "回应" },
  { id: "fail", label: "失落反应", row: 5, frames: 8, loopMs: 1120, group: "回应" },
  { id: "waiting", label: "等待陪伴", row: 6, frames: 6, loopMs: 1500, group: "陪伴" },
  { id: "run", label: "原地小跑", row: 7, frames: 6, loopMs: 760, group: "移动" },
  { id: "review", label: "认真查看", row: 8, frames: 6, loopMs: 1300, group: "陪伴" },
  { id: "heart", label: "比心", sprite: "./assets/actions/heart-gesture-v1.png", columns: 4, sheetRows: 2, frames: 8, loopMs: 1680, group: "回应" },
  { id: "shy", label: "害羞", sprite: "./assets/actions/shy-gesture-v1.png", columns: 4, sheetRows: 2, frames: 8, loopMs: 1680, group: "回应" },
  { id: "celebrate", label: "庆祝", sprite: "./assets/actions/celebrate-gesture-v1.png", columns: 4, sheetRows: 2, frames: 8, loopMs: 1680, group: "回应" },
  { id: "rps-rock", label: "猜拳 · 石头", sprite: "./assets/actions/celebrate-gesture-v1.png", columns: 4, sheetRows: 2, frames: 4, frameSequence: [3, 3, 3, 3], loopMs: 1360, gestureChoice: "rock", group: "游戏" },
  { id: "rps-scissors", label: "猜拳 · 剪刀", sprite: "./assets/actions/celebrate-gesture-v1.png", columns: 4, sheetRows: 2, frames: 4, frameSequence: [1, 1, 1, 1], loopMs: 1360, gestureChoice: "scissors", group: "游戏" },
  { id: "rps-paper", label: "猜拳 · 布", sprite: "./assets/actions/celebrate-gesture-v1.png", columns: 4, sheetRows: 2, frames: 4, frameSequence: [1, 1, 1, 1], loopMs: 1360, gestureChoice: "paper", group: "游戏" },
  { id: "feed", label: "开心吃点心", row: 8, frames: 6, loopMs: 1500, group: "互动" },
  { id: "pet", label: "被摸摸头", sprite: "./assets/actions/shy-gesture-v1.png", columns: 4, sheetRows: 2, frames: 8, loopMs: 1550, group: "互动" },
  { id: "hug", label: "抱抱", sprite: "./assets/actions/heart-gesture-v1.png", columns: 4, sheetRows: 2, frames: 8, loopMs: 1680, group: "互动" },
]);

export const GAZE_DIRECTIONS = Object.freeze(Array.from({ length: 16 }, (_, index) => ({
  id: index,
  label: ["正前", "右前", "右前下", "右侧前", "正右", "右侧后", "右后下", "右后", "正后", "左后", "左后下", "左侧后", "正左", "左侧前", "左前下", "左前"][index],
  row: index < 8 ? 9 : 10,
  column: index % 8,
  angle: index * 22.5,
})));

export function gazeIndexFromPoint(origin, point) {
  if (!origin || !point) return 0;
  const degrees = (Math.atan2(point.x - origin.x, origin.y - point.y) * 180 / Math.PI + 360) % 360;
  return Math.round(degrees / 22.5) % 16;
}

export function directionForGaze(index) {
  const normalized = ((Math.trunc(index) % 16) + 16) % 16;
  return GAZE_DIRECTIONS[normalized];
}

export function atlasCellStyle(row, column, atlasUrl = ATLAS_URL) {
  const safeColumn = Math.max(0, Math.min(ATLAS.columns - 1, column));
  const safeRow = Math.max(0, Math.min(ATLAS.rows - 1, row));
  return {
    backgroundImage: `url("${atlasUrl}")`,
    backgroundSize: `${ATLAS.columns * 100}% ${ATLAS.rows * 100}%`,
    backgroundPosition: `${safeColumn * 100 / (ATLAS.columns - 1)}% ${safeRow * 100 / (ATLAS.rows - 1)}%`,
  };
}

export function spriteSheetCellStyle(sprite, frame, columns, rows) {
  const safeColumns = Math.max(1, Math.trunc(columns));
  const safeRows = Math.max(1, Math.trunc(rows));
  const safeFrame = Math.max(0, Math.trunc(frame));
  const column = safeFrame % safeColumns;
  const row = Math.min(safeRows - 1, Math.floor(safeFrame / safeColumns));
  return {
    backgroundImage: `url("${sprite}")`,
    backgroundSize: `${safeColumns * 100}% ${safeRows * 100}%`,
    backgroundPosition: `${safeColumns === 1 ? 0 : column * 100 / (safeColumns - 1)}% ${safeRows === 1 ? 0 : row * 100 / (safeRows - 1)}%`,
  };
}
