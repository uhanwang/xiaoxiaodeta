import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Armchair, Award, CalendarCheck2, Check, ChevronRight, Coffee, Crown, Gamepad2, Grid2X2,
  Heart, ImagePlus, MessageCircle, Moon, RotateCcw, Sparkles, Star, Timer, Trophy, X,
} from "lucide-react";
import { AtlasFrame } from "./AtlasFrame.jsx";
import { ATLAS_ACTION_FALLBACKS, ATLAS_STATE_FALLBACKS, PET_ACTIONS } from "./actionRegistry.js";
import { COSMETIC_ITEMS, DAILY_TASKS, FOOD_ITEMS, WEEKLY_TASKS, localDateKey } from "./progression.js";
import { useProgressSave } from "./useProgressSave.js";
import { getSweetReply } from "./chatReplies.js";
import { createMemoryGame, flipMemoryCard, hideMemoryMismatch, MEMORY_PAIRS } from "./memoryGame.js";
import { randomRpsChoice, resolveRpsRound, RPS_CHOICES } from "./rpsGame.js";
import { catchStar, createStarCatchGame, tickStarCatchGame } from "./starCatch.js";
import { LITE_ROLE_OPTIONS } from "./litePetMode.js";

gsap.registerPlugin(useGSAP);

const BADGES = [
  ["first-checkin", "初次相遇", "完成第一次签到"],
  ["focus-partner", "专注搭档", "完成一次专注"],
  ["star-seeker", "星星猎人", "找到一轮星星"],
  ["familiar-days", "熟悉的日常", "累计互动 50 次"],
  ["week-together", "一周相伴", "连续签到 7 天"],
];

const CHAT_QUICK_REPLIES = ["夸夸你", "今天好吗", "给我打气"];
const RPS_BY_ID = Object.fromEntries(RPS_CHOICES.map((choice) => [choice.id, choice]));
const LEGACY_ACTIONS = [
  { id: "sit", label: "坐下来", Icon: Armchair },
  { id: "sleep", label: "睡觉", Icon: Moon },
];
const COLLECTION_ACTIONS = [
  ...PET_ACTIONS.map(({ id, label, group }) => ({ id, label, group })),
  ...LEGACY_ACTIONS.map(({ id, label }) => ({ id, label, group: "原有动作" })),
];

function progressFor(save, task) {
  const source = task.id.startsWith("weekly") ? save.activity.weekly : save.activity.daily;
  return Math.min(task.goal, source[task.id] || 0);
}

function nextStarPosition(previous = null) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const position = { x: 8 + Math.random() * 76, y: 10 + Math.random() * 62 };
    if (!previous || Math.hypot(position.x - previous.x, position.y - previous.y) >= 16) return position;
  }
  return { x: previous?.x < 50 ? 76 : 22, y: previous?.y < 40 ? 60 : 18 };
}

function TaskCard({ task, save, weekly = false }) {
  const progress = progressFor(save, task);
  const done = progress >= task.goal;
  return (
    <article className={`growth-task ${done ? "is-done" : ""}`}>
      <span className="task-check">{done ? <Check size={15} /> : <span>{progress}/{task.goal}</span>}</span>
      <div className="task-copy"><strong>{task.label}</strong><small>经验 +{task.rewardXp} · 代币 +{task.rewardTokens}</small></div>
      <div className="task-meter"><i style={{ width: `${Math.min(100, progress / task.goal * 100)}%` }} /></div>
      <span className="task-period">{weekly ? "本周" : "今日"}</span>
    </article>
  );
}

export function CompanionDashboard() {
  const { save, record } = useProgressSave();
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState(["home", "play", "memory", "actions", "collection", "chat"].includes(requestedTab) ? requestedTab : "home");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { from: "pet", text: "我在呀。想说什么都可以。" },
  ]);
  const [starHunt, setStarHunt] = useState({ active: false, hits: 0, timeLeft: 12 });
  const [starPosition, setStarPosition] = useState(() => nextStarPosition());
  const [memoryGame, setMemoryGame] = useState(() => createMemoryGame());
  const [memoryRewardMessage, setMemoryRewardMessage] = useState("");
  const [rpsChoiceOpen, setRpsChoiceOpen] = useState(false);
  const [rpsResult, setRpsResult] = useState(null);
  const [rpsRound, setRpsRound] = useState(null);
  const [starCatchGame, setStarCatchGame] = useState(null);
  const [starCatchMessage, setStarCatchMessage] = useState("");
  const [motionEvent, setMotionEvent] = useState({ selector: "", token: 0 });
  const [interactionFeedback, setInteractionFeedback] = useState("");
  const [memoryFeedback, setMemoryFeedback] = useState("");
  const [focusRemaining, setFocusRemaining] = useState(0);
  const [customAtlas, setCustomAtlas] = useState(false);
  const [atlasMode, setAtlasMode] = useState("default");
  const [atlasAnchors, setAtlasAnchors] = useState(null);
  const [outfitVariants, setOutfitVariants] = useState([]);
  const [closetSlots, setClosetSlots] = useState([]);
  const [closetBusy, setClosetBusy] = useState(false);
  const [liteManifest, setLiteManifest] = useState(null);
  const [atlasMessage, setAtlasMessage] = useState("");
  const [atlasDragOver, setAtlasDragOver] = useState(false);
  const [litePhotos, setLitePhotos] = useState([]);
  const [liteBusy, setLiteBusy] = useState(false);
  const starTimer = useRef(null);
  const focusTimer = useRef(null);
  const mismatchTimer = useRef(null);
  const rpsTimers = useRef([]);
  const rpsRoundRef = useRef(null);
  const starCatchTimer = useRef(null);
  const starCatchSession = useRef(0);
  const starCatchFinished = useRef(true);
  const motionRoot = useRef(null);
  const memoryClaimed = useRef(false);
  const today = localDateKey();
  const nextLevelProgress = save.progression.xp % 100;
  const unlockedBadges = useMemo(() => new Set(save.progression.badges), [save.progression.badges]);
  const equipped = save.progression.equipped || { outfit: "default", accessories: { head: "none", neck: "none", prop: "none" } };
  const collectedActions = new Set(save.progression.actionCollection || []);

  useGSAP(() => {
    if (!motionEvent.selector) return;
    const target = motionRoot.current?.querySelector(motionEvent.selector);
    if (!target) return;
    gsap.fromTo(target, { scale: 0.92, y: 7, opacity: 0.82 }, {
      scale: 1, y: 0, opacity: 1, duration: 0.42, ease: "back.out(1.7)", clearProps: "transform,opacity",
    });
  }, { scope: motionRoot, dependencies: [motionEvent.token], revertOnUpdate: true });

  useEffect(() => { document.title = "小小的她 · 陪伴面板"; }, []);

  useEffect(() => {
    let active = true;
    window.pet?.customAtlasStatus?.().then((status) => {
      if (!active) return;
      setCustomAtlas(Boolean(status?.custom));
      setAtlasMode(status?.mode || "default");
      setLiteManifest(status?.mode === "lite" ? (status.manifest || null) : null);
      setAtlasAnchors(status?.anchors || null);
      setOutfitVariants(Array.isArray(status?.outfitVariants) ? status.outfitVariants : []);
    }).catch(() => {});
    window.pet?.closetList?.().then((data) => {
      if (active) setClosetSlots(Array.isArray(data?.slots) ? data.slots : []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const refreshCloset = () => {
    window.pet?.closetList?.().then((data) => setClosetSlots(Array.isArray(data?.slots) ? data.slots : [])).catch(() => {});
  };

  useEffect(() => window.pet?.onQPetProgress?.((progress) => {
    if (progress?.finished && !progress.error) {
      window.pet?.customAtlasStatus?.().then((status) => {
        setCustomAtlas(Boolean(status?.custom));
        setAtlasMode(status?.mode || "default");
        setLiteManifest(status?.mode === "lite" ? (status.manifest || null) : null);
        setAtlasAnchors(status?.anchors || null);
        setOutfitVariants(Array.isArray(status?.outfitVariants) ? status.outfitVariants : []);
      }).catch(() => {});
      refreshCloset();
    }
  }), []);

  const refreshAtlasStatus = () => {
    window.pet?.customAtlasStatus?.().then((status) => setCustomAtlas(Boolean(status?.custom))).catch(() => {});
  };

  const applyAtlasResult = (result) => {
    if (!result) return;
    if (result.ok) {
      setAtlasMessage(result.message || "");
      refreshAtlasStatus();
      return;
    }
    if (!result.canceled) setAtlasMessage(result.error);
  };

  const chooseAtlasFile = async () => {
    setAtlasMessage("");
    applyAtlasResult(await window.pet?.chooseCustomAtlas?.());
  };

  const resetAtlasToDefault = async () => {
    setAtlasMessage("");
    applyAtlasResult(await window.pet?.resetCustomAtlas?.());
  };

  const handleAtlasDrop = async (event) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer?.files || []).find((item) => /\.png$/i.test(item.name));
    if (!file) {
      setAtlasMessage("请拖入 PNG 格式的动作图集。");
      return;
    }
    const filePath = window.pet?.pathForFile?.(file);
    if (!filePath) {
      setAtlasMessage("无法读取拖入文件的路径，请改用“选择图集”按钮。");
      return;
    }
    setAtlasMessage("");
    applyAtlasResult(await window.pet?.installCustomAtlas?.(filePath));
  };

  const handleLiteFiles = (event) => {
    const files = Array.from(event.target?.files || []);
    event.target.value = "";
    if (!files.length) return;
    setLitePhotos((current) => {
      const next = [...current];
      const usedRoles = new Set(next.map((item) => item.role).filter(Boolean));
      for (const file of files) {
        const sourcePath = window.pet?.pathForFile?.(file);
        if (!sourcePath) {
          setAtlasMessage("无法读取照片路径，请把照片放在本地磁盘后重试。");
          continue;
        }
        const freeRole = LITE_ROLE_OPTIONS.map(([role]) => role).find((role) => !usedRoles.has(role)) || "";
        if (freeRole) usedRoles.add(freeRole);
        next.push({ sourcePath, role: freeRole, previewUrl: URL.createObjectURL(file), name: file.name });
      }
      return next;
    });
  };

  const changeLiteRole = (index, role) => {
    setLitePhotos((current) => current.map((item, position) => {
      if (position === index) return { ...item, role };
      if (item.role === role) return { ...item, role: current[index].role };
      return item;
    }));
  };

  const removeLitePhoto = (index) => {
    setLitePhotos((current) => {
      const removed = current[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, position) => position !== index);
    });
  };

  const installLitePhotos = async () => {
    const entries = litePhotos.map((item) => ({ role: item.role, sourcePath: item.sourcePath }));
    if (litePhotos.some((item) => !item.role)) {
      setAtlasMessage("每张照片都需要选一个姿势类型，不需要的可以先移除。");
      return;
    }
    if (!entries.some((entry) => entry.role === "idle")) {
      setAtlasMessage("请为其中一张照片选择“日常站姿”，它是桌宠的基础形象。");
      return;
    }
    setLiteBusy(true);
    setAtlasMessage("正在本地抠图，请稍等几秒…");
    const result = await window.pet?.installLitePet?.(entries);
    setLiteBusy(false);
    if (!result) return;
    if (result.ok) {
      setAtlasMessage(result.message);
      refreshAtlasStatus();
    } else {
      setAtlasMessage(result.error);
    }
  };

  const startGuideAssembly = (outfit) => {
    window.pet?.openOnboarding?.(outfit);
  };

  const saveCurrentLook = async () => {
    setClosetBusy(true);
    const result = await window.pet?.closetSave?.();
    setClosetBusy(false);
    if (result?.ok) {
      setAtlasMessage(result.message || "已保存。");
      refreshCloset();
    } else if (result?.error) {
      setAtlasMessage(result.error);
    }
  };

  const switchClosetSlot = async (slotId) => {
    setClosetBusy(true);
    const result = await window.pet?.closetSwitch?.(slotId);
    setClosetBusy(false);
    if (result?.ok) {
      setAtlasMessage(result.message || "已切换形象。");
      refreshCloset();
    } else if (result?.error) {
      setAtlasMessage(result.error);
    }
  };

  const deleteClosetSlot = async (slotId) => {
    setClosetBusy(true);
    const result = await window.pet?.closetDelete?.(slotId);
    setClosetBusy(false);
    if (result?.ok) {
      setAtlasMessage(result.message || "已删除。");
      refreshCloset();
    } else if (result?.error) {
      setAtlasMessage(result.error);
    }
  };

  useEffect(() => () => {
    window.clearInterval(starTimer.current);
    window.clearInterval(focusTimer.current);
    window.clearTimeout(mismatchTimer.current);
    window.clearInterval(starCatchTimer.current);
    rpsTimers.current.forEach((timer) => window.clearTimeout(timer));
    if (rpsRoundRef.current?.phase && rpsRoundRef.current.phase !== "complete") {
      window.pet?.playAction?.({ type: "rps", phase: "cancel", roundId: rpsRoundRef.current.roundId });
    }
  }, []);

  const startStarHunt = () => {
    window.clearInterval(starTimer.current);
    setStarHunt({ active: true, hits: 0, timeLeft: 12 });
    setStarPosition(nextStarPosition());
    let seconds = 12;
    starTimer.current = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        window.clearInterval(starTimer.current);
        setStarHunt((current) => current.hits >= 5 ? current : ({ ...current, active: false, timeLeft: 0 }));
        return;
      }
      setStarHunt((current) => ({ ...current, timeLeft: seconds }));
    }, 1000);
  };

  const tapStar = () => {
    if (!starHunt.active) return;
    const next = starHunt.hits + 1;
    if (next >= 5) {
      window.clearInterval(starTimer.current);
      setStarHunt((current) => ({ active: false, hits: 5, timeLeft: current.timeLeft }));
      record("starGameComplete");
      return;
    }
    setStarHunt((current) => ({ ...current, hits: next }));
    setStarPosition((position) => nextStarPosition(position));
  };

  useEffect(() => {
    if (!memoryGame.locked) return undefined;
    mismatchTimer.current = window.setTimeout(() => setMemoryGame((current) => hideMemoryMismatch(current)), 720);
    return () => window.clearTimeout(mismatchTimer.current);
  }, [memoryGame.locked, memoryGame.opened]);

  useEffect(() => {
    if (!memoryGame.complete || memoryClaimed.current) return;
    memoryClaimed.current = true;
    record("memoryGameComplete").then((result) => {
      setMemoryRewardMessage(result.applied ? "今天的奖励已收下：经验 +15 · 星星 +2" : "今天的记忆游戏奖励已经领取啦");
    });
  }, [memoryGame.complete, record]);

  useEffect(() => {
    if (!starCatchGame || starCatchGame.active || starCatchFinished.current) return;
    starCatchFinished.current = true;
    window.clearInterval(starCatchTimer.current);
    starCatchTimer.current = null;
    const sessionId = `star-catch-${starCatchSession.current}-${Date.now()}`;
    const score = starCatchGame.score;
    record({ type: "starCatchComplete", sessionId, score, bestCombo: starCatchGame.bestCombo }).then((result) => {
      setStarCatchMessage(result.rewardGranted
        ? "今天的奖励收下啦：星星 +1 · 经验 +12"
        : score < 5 ? "抓到啦！再多接几颗就能拿到今日奖励。" : "本局记录已更新，今日奖励已经领取过啦。");
    });
    window.pet?.playAction?.(score >= 5 ? "celebrate" : "heart");
    setMotionEvent((event) => ({ selector: ".star-catch-status", token: event.token + 1 }));
  }, [starCatchGame, record]);

  const restartMemoryGame = () => {
    window.clearTimeout(mismatchTimer.current);
    memoryClaimed.current = false;
    setMemoryRewardMessage("");
    setMemoryGame(createMemoryGame());
  };

  const flipCard = (index) => {
    setMemoryGame((current) => {
      const next = flipMemoryCard(current, index);
      if (next !== current) {
        const feedback = next.locked ? "mismatch" : next.matchedPairs > current.matchedPairs ? "matched" : "reveal";
        setMemoryFeedback(feedback);
        window.setTimeout(() => setMemoryFeedback(""), feedback === "mismatch" ? 720 : 430);
      }
      return next;
    });
  };

  const startFocus = () => {
    window.clearInterval(focusTimer.current);
    setFocusRemaining(25 * 60);
  };

  useEffect(() => {
    if (!focusRemaining) return undefined;
    focusTimer.current = window.setInterval(() => {
      setFocusRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(focusTimer.current);
  }, [focusRemaining > 0]);

  useEffect(() => {
    if (focusRemaining === 0 && focusTimer.current) {
      window.clearInterval(focusTimer.current);
      focusTimer.current = null;
      if (focusWasStarted.current) {
        focusWasStarted.current = false;
        record({ type: "focusComplete", sessionId: `dashboard-${today}-${Math.floor(Date.now() / 1000)}` });
      }
    }
  }, [focusRemaining, record, today]);

  const focusWasStarted = useRef(false);
  const beginFocus = () => {
    focusWasStarted.current = true;
    startFocus();
  };

  const sendMessage = (text = chatInput) => {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;
    setChatMessages((messages) => [...messages, { from: "user", text: clean }, { from: "pet", text: getSweetReply(clean) }].slice(-30));
    setChatInput("");
    record("chat");
  };

  const playRps = (choice) => {
    const playerChoice = RPS_CHOICES.find((item) => item.label === choice)?.id;
    if (!playerChoice || ["countdown", "reveal"].includes(rpsRoundRef.current?.phase)) return;
    const resolved = resolveRpsRound(playerChoice, randomRpsChoice());
    const roundId = `rps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRpsChoiceOpen(false);
    setRpsResult(null);
    const round = { ...resolved, roundId, phase: "countdown", count: 3 };
    rpsRoundRef.current = round;
    setRpsRound(round);
    window.pet?.playAction?.({ type: "rps", phase: "countdown", count: 3, roundId });
    rpsTimers.current.forEach((timer) => window.clearTimeout(timer));
    rpsTimers.current = [
      window.setTimeout(() => {
        const next = { ...round, count: 2 };
        rpsRoundRef.current = next;
        setRpsRound(next);
        window.pet?.playAction?.({ type: "rps", phase: "countdown", count: 2, roundId });
      }, 520),
      window.setTimeout(() => {
        const next = { ...round, count: 1 };
        rpsRoundRef.current = next;
        setRpsRound(next);
        window.pet?.playAction?.({ type: "rps", phase: "countdown", count: 1, roundId });
      }, 1040),
      window.setTimeout(() => {
        const next = { ...round, phase: "reveal" };
        rpsRoundRef.current = next;
        setRpsRound(next);
        window.pet?.playAction?.({ type: "rps", phase: "reveal", roundId, petChoice: resolved.petChoice });
        record({ type: "actionCollect", actionId: resolved.actionId });
      }, 1560),
      window.setTimeout(() => {
        rpsRoundRef.current = { ...round, phase: "complete" };
        setRpsRound(rpsRoundRef.current);
        setRpsResult({ ...resolved, roundId });
        window.pet?.playAction?.({ type: "rps", phase: "result", roundId, outcome: resolved.outcome });
        record(resolved.outcome === "win" ? "rpsWin" : resolved.outcome === "draw" ? "rpsDraw" : "rpsLose");
        setInteractionFeedback(resolved.outcome === "win" ? "这局你赢啦，星星已经记下。" : resolved.outcome === "draw" ? "平局也很可爱。" : "这局她赢啦，再来一把吧。没有扣分。 ");
        setChatMessages((messages) => [...messages, {
          from: "pet",
          text: resolved.outcome === "win" ? `你赢啦！我出了${RPS_BY_ID[resolved.petChoice].label}。` : resolved.outcome === "draw" ? `我们都出了${RPS_BY_ID[resolved.petChoice].label}，平局啦。` : `我出了${RPS_BY_ID[resolved.petChoice].label}，这局我赢啦。`,
        }].slice(-30));
        setMotionEvent((event) => ({ selector: ".rps-result", token: event.token + 1 }));
      }, 2620),
    ];
  };

  const startStarCatch = () => {
    if (starCatchGame?.active) return;
    window.clearInterval(starCatchTimer.current);
    starCatchFinished.current = false;
    starCatchSession.current += 1;
    setStarCatchMessage("");
    setStarCatchGame(createStarCatchGame(Date.now()));
    window.pet?.playAction?.("waiting");
    starCatchTimer.current = window.setInterval(() => {
      setStarCatchGame((current) => tickStarCatchGame(current));
    }, 1000);
  };

  const tapCatchStar = (targetId) => {
    if (!starCatchGame?.active || starCatchGame.target?.id !== targetId) return;
    setStarCatchGame((current) => catchStar(current, targetId));
    setMotionEvent((event) => ({ selector: ".star-catch-target", token: event.token + 1 }));
    if ((starCatchGame.combo + 1) % 5 === 0) window.pet?.playAction?.("celebrate");
  };

  const runCareAction = async (event, actionId, successMessage) => {
    const result = await record(event);
    setInteractionFeedback(result.applied ? successMessage : result.reason || "这次互动没有完成。 ");
    if (result.applied && actionId) window.pet?.playAction?.(actionId);
    return result;
  };
  const playAndCollectAction = (actionId) => {
    record({ type: "actionCollect", actionId });
    window.pet?.playAction?.(actionId);
  };
  const feedPet = () => {
    const food = FOOD_ITEMS.find((item) => save.inventory.foods[item.id] > 0);
    if (!food) return runCareAction({ type: "feed", foodId: "biscuit" }, null, "");
    return runCareAction({ type: "feed", foodId: food.id }, "feed", `她开心地吃掉了${food.name}。`);
  };
  const buyFood = (food) => record({ type: "buyFood", foodId: food.id }).then((result) => {
    setInteractionFeedback(result.applied ? `买到${food.name}啦，已经放进背包。` : result.reason);
  });
  const chooseCosmetic = (item) => {
    if (!save.progression.collection.includes(item.id)) {
      return record({ type: "buyCosmetic", itemId: item.id }).then((result) => {
        setInteractionFeedback(result.applied ? `收下${item.name}啦，可以试穿了。` : result.reason);
      });
    }
    return record({ type: "equip", itemId: item.id }).then((result) => {
      if (result.applied) {
        setInteractionFeedback(item.type === "outfit" ? `换上${item.name}啦。` : `戴上${item.name}啦。`);
        setMotionEvent((event) => ({ selector: ".wardrobe-card.equipped", token: event.token + 1 }));
      }
    });
  };
  const removeAccessory = (slot) => record({ type: "equip", itemId: "none", slot }).then((result) => {
    if (result.applied) setInteractionFeedback(`已取下${slot === "head" ? "头部" : slot === "neck" ? "颈部" : "肩挂"}配饰。`);
  });
  const checkInDone = save.stats.lastCheckIn === today;
  const openTab = (next) => setTab(next);

  return (
    <main ref={motionRoot} className="dashboard-window">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="brand-mark"><img src="./assets/brand/mascot-icon.png" alt="" /></span>
          <div><strong>小小的她</strong><small>静静陪伴你的桌面伙伴</small></div>
        </div>
        <div className="topbar-status"><i className="connected" />本地陪伴<span className="offline-pill">本地存档</span></div>
        <button className="icon-button" type="button" title="关闭面板" aria-label="关闭面板" onClick={() => window.pet?.closeDashboard?.()}><X size={18} /></button>
      </header>

      <nav className="dashboard-tabs" aria-label="陪伴面板导航">
        {[["home", "今日陪伴", Heart], ["play", "互动玩法", Gamepad2], ["memory", "记忆翻牌", Grid2X2], ["actions", "动作收藏", Sparkles], ["collection", "徽章装扮", Trophy], ["chat", "文字聊天", MessageCircle]].map(([id, label, Icon]) => (
          <button key={id} data-dashboard-tab={id} className={tab === id ? "active" : ""} type="button" onClick={() => openTab(id)}><Icon size={16} />{label}{id === "chat" && <span className="tab-local">本地</span>}</button>
        ))}
      </nav>

      <section className="dashboard-content">
        {tab === "home" && (
          <div className="dashboard-home">
            <section className="hero-card">
              <div className="hero-copy">
                <span className="eyebrow">LEVEL {save.progression.level} · {today}</span>
                <h1>今天也一起<br />慢慢来吧。</h1>
                <p>不催促、不掉线惩罚。你的陪伴进度只保存在这台电脑上。</p>
                <div className="xp-block"><div className="xp-label"><span>成长经验</span><b>{nextLevelProgress} / 100 XP</b></div><div className="xp-meter"><i style={{ width: `${nextLevelProgress}%` }} /></div><small>再获得 {100 - nextLevelProgress} XP 升到 Lv.{save.progression.level + 1}</small></div>
                <div className="hero-quick-actions">
                  <button type="button" disabled={save.needs.satiety >= 75 || !FOOD_ITEMS.some((item) => save.inventory.foods[item.id] > 0)} onClick={feedPet}><Coffee size={16} />投喂</button>
                  <button type="button" onClick={() => runCareAction("pet", "pet", "摸摸头的回应收到啦。")}><Heart size={16} />摸摸头</button>
                  <button type="button" disabled={checkInDone} onClick={() => record("checkin")}><CalendarCheck2 size={16} />{checkInDone ? "已签到" : "签到"}</button>
                </div>
              </div>
              <div className="hero-pet">{atlasMode === "lite" && liteManifest?.images?.idle ? <div className="hero-lite-pet"><img src={`./assets/custom/lite/${liteManifest.images.idle}`} alt="桌宠" /></div> : <AtlasFrame row={3} frames={4} loopMs={1000} label="桌宠挥手" outfit={equipped.outfit} accessories={equipped.accessories} anchors={atlasAnchors} />}<div className="pet-caption">{atlasMode === "lite" ? "你的照片形象" : COSMETIC_ITEMS.find((item) => item.type === "outfit" && item.outfit === equipped.outfit)?.name || "日常白裙"}</div></div>
              <div className="hero-decoration deco-one">✦</div><div className="hero-decoration deco-two">♡</div>
            </section>

            <div className="dashboard-stats">
              <article><Heart size={17} /><span>亲密度</span><strong>{save.stats.affection}<small>/100</small></strong></article>
              <article><Coffee size={17} /><span>代币</span><strong>{save.currencies.tokens}</strong></article>
              <article><Sparkles size={17} /><span>星星</span><strong>{save.currencies.stars}</strong></article>
              <article className="satiety-stat"><Heart size={17} /><span>饱腹度</span><strong>{save.needs.satiety}<small>/100</small></strong><i style={{ width: (save.needs.satiety + "%") }} /></article>
              <article><CalendarCheck2 size={17} /><span>连续签到</span><strong>{save.stats.streak}<small>天</small></strong></article>
            </div>
            {interactionFeedback && <p className="interaction-feedback" role="status">{interactionFeedback}</p>}

            <div className="task-columns">
              <section className="task-section"><div className="section-heading"><div><span className="eyebrow">SMALL STEPS</span><h2>今日小目标</h2></div><span className="date-chip">每天更新</span></div>{DAILY_TASKS.map((task) => <TaskCard key={task.id} task={task} save={save} />)}</section>
              <section className="task-section weekly-section"><div className="section-heading"><div><span className="eyebrow">TOGETHER THIS WEEK</span><h2>本周陪伴</h2></div><span className="date-chip">周一更新</span></div>{WEEKLY_TASKS.map((task) => <TaskCard key={task.id} task={task} save={save} weekly />)}</section>
            </div>
          </div>
        )}

        {tab === "play" && (
          <div className="play-page">
            <div className="page-heading"><span className="eyebrow">PLAY TOGETHER</span><h1>给今天加一点小乐趣</h1><p>没有输赢惩罚，奖励固定；漏掉的日子不会扣分。</p></div>
            {interactionFeedback && <p className="interaction-feedback" role="status">{interactionFeedback}</p>}
            <section className="food-shop-card">
              <div className="food-shop-heading"><div><span className="eyebrow">LITTLE PANTRY</span><h2>点心小铺</h2><p>饱腹度 {save.needs.satiety}/100 · 运行时每 10 分钟下降 1 点</p></div><button type="button" className="feed-now" disabled={save.needs.satiety >= 75 || !FOOD_ITEMS.some((item) => save.inventory.foods[item.id] > 0)} onClick={feedPet}><Coffee size={15} />喂她吃点心</button></div>
              <div className="satiety-meter"><i style={{ width: (save.needs.satiety + "%") }} /></div>
              <div className="food-shelf">{FOOD_ITEMS.map((food) => <article key={food.id} className="food-item"><span className="food-art">{food.icon}</span><div><strong>{food.name}</strong><small>饱腹度 +{food.satiety} · 背包 {save.inventory.foods[food.id]}</small></div><button type="button" disabled={save.currencies.tokens < food.price} onClick={() => buyFood(food)}><Coffee size={13} />{food.price} 代币</button></article>)}</div>
            </section>
            <div className="play-grid">
              <article className="play-card star-catch-card">
                <div className="play-icon gold"><Star size={21} /></div>
                <div className="star-catch-heading"><h2>接住星星</h2><p>{starCatchGame?.active ? `剩余 ${starCatchGame.timeLeft} 秒 · 连击 ${starCatchGame.combo}` : `最高 ${save.games.starCatch.bestScore} 颗 · 连击 ${save.games.starCatch.bestCombo}`}</p></div>
                <button className="card-cta" type="button" disabled={starCatchGame?.active} onClick={startStarCatch}>{starCatchGame?.active ? "正在玩" : starCatchGame ? "再玩一局" : "开始"}<ChevronRight size={16} /></button>
                <div className="star-catch-playfield" aria-label="接星星游戏区域">
                  {starCatchGame?.active && starCatchGame.target && <button key={starCatchGame.target.id} className="star-catch-target" style={{ left: `${starCatchGame.target.x}%`, top: `${starCatchGame.target.y}%` }} type="button" onClick={() => tapCatchStar(starCatchGame.target.id)} aria-label="接住星星"><Star fill="currentColor" size={25} /></button>}
                  {!starCatchGame?.active && <span className="star-catch-idle">30 秒 · 接得越多连击越高</span>}
                </div>
                <p className="star-catch-status" role="status">{starCatchGame?.active ? `得分 ${starCatchGame.score} · 每 5 连击额外 +1` : starCatchMessage || "今日首次接到 5 颗可获得星星 +1"}</p>
                <div className="card-reward">每日首轮达 5 颗 · 星星 +1 · 经验 +12</div>
              </article>
              <article className={`play-card star-hunt-card ${starHunt.active ? "is-hunting" : ""}`}><div className="play-icon blush"><Star size={21} /></div><div><h2>找星星</h2><p>{starHunt.active ? `12 秒内再找到 ${5 - starHunt.hits} 颗 · 剩余 ${starHunt.timeLeft} 秒` : starHunt.hits === 5 ? "今天这轮完成啦" : "点击五次，帮她把星星找回来"}</p></div>{starHunt.active ? <span className="hunt-counter">{starHunt.hits}/5</span> : <button className="card-cta" type="button" onClick={startStarHunt}>{starHunt.hits === 5 ? "再玩一轮" : "开始"}<ChevronRight size={16} /></button>}{starHunt.active && <div className="star-hunt-field"><button className="star-target" style={{ left: `${starPosition.x}%`, top: `${starPosition.y}%` }} type="button" onClick={tapStar} aria-label="找到一颗星星"><Star fill="currentColor" size={24} /></button></div>}<div className="card-reward">完成奖励 · 经验 +20 · 星星 +3</div></article>
              <article className="play-card"><div className="play-icon gold"><Timer size={21} /></div><div><h2>专注陪伴</h2><p>{focusRemaining ? `${Math.floor(focusRemaining / 60).toString().padStart(2, "0")}:${(focusRemaining % 60).toString().padStart(2, "0")} · 她会安静陪你` : "一起完成一段 25 分钟专注"}</p></div>{focusRemaining ? <button className="card-cta secondary" type="button" onClick={() => { window.clearInterval(focusTimer.current); focusTimer.current = null; setFocusRemaining(0); focusWasStarted.current = false; }}>结束</button> : <button className="card-cta" type="button" onClick={beginFocus}>开始<ChevronRight size={16} /></button>}<div className="card-reward">完成奖励 · 经验 +25 · 星星 +2</div></article>
              <article className="play-card"><div className="play-icon rose"><Coffee size={21} /></div><div><h2>今日心愿</h2><p>“希望今天的你，遇到的事情都顺顺利利。”</p></div><button className="card-cta" type="button" disabled={save.claims.includes(`wish:${today}`)} onClick={() => record("wish")}>{save.claims.includes(`wish:${today}`) ? "已收下" : "收下"}<ChevronRight size={16} /></button><div className="card-reward">固定奖励 · 每天一次 · 星星 +1</div></article>
              <article className="play-card rps-card">
                <div className="play-icon plum"><Gamepad2 size={21} /></div>
                <div><h2>猜拳</h2><p>{rpsRound?.phase === "countdown" ? `准备好啦，${rpsRound.count}……` : rpsRound?.phase === "reveal" ? `她出了${RPS_BY_ID[rpsRound.petChoice].label}！` : rpsResult ? rpsResult.outcome === "win" ? "你赢啦，她在桌面上开心庆祝。" : rpsResult.outcome === "draw" ? "平局啦，她也比了同样的手势。" : "这局她赢啦，她害羞地笑了。" : "她会先倒数，再在桌面上亮出自己的手势。"}</p></div>
                {rpsChoiceOpen ? <div className="rps-inline">{RPS_CHOICES.map((choice) => <button key={choice.id} disabled={["countdown", "reveal"].includes(rpsRound?.phase)} type="button" onClick={() => playRps(choice.label)}>{choice.label}</button>)}</div> : <button className="card-cta" type="button" disabled={["countdown", "reveal"].includes(rpsRound?.phase)} onClick={() => setRpsChoiceOpen(true)}>{["countdown", "reveal"].includes(rpsRound?.phase) ? "进行中" : "出拳"}<ChevronRight size={16} /></button>}
                {rpsRound?.phase === "reveal" && <div className="rps-reveal"><span>{RPS_BY_ID[rpsRound.petChoice].icon}</span><b>她出拳啦</b></div>}
                {rpsResult && <div className={`rps-result outcome-${rpsResult.outcome}`}><span><b>{RPS_BY_ID[rpsResult.playerChoice].icon}</b>你</span><i>VS</i><span><b>{RPS_BY_ID[rpsResult.petChoice].icon}</b>她</span><strong>{rpsResult.outcome === "win" ? "你赢啦 · 星星 +1" : rpsResult.outcome === "draw" ? "平局 · 没有扣分" : "她赢啦 · 下次再来"}</strong></div>}
                <div className="card-reward">每日首次胜利奖励星星 +1 · 不扣星星</div>
              </article>
              <article className="play-card"><div className="play-icon sage"><Heart size={21} /></div><div><h2>抱抱互动</h2><p>她会张开手臂回应，桌面浮窗播放抱抱动作。</p></div><button className="card-cta" type="button" onClick={() => runCareAction("hug", "hug", "抱抱已经送到她怀里啦。")}>抱抱她<ChevronRight size={16} /></button><div className="card-reward">亲密度 +2 · 能量 +1</div></article>
              <article className="play-card"><div className="play-icon blue"><MessageCircle size={21} /></div><div><h2>说说话</h2><p>纯文字、离线回应，内容只留在当前窗口</p></div><button className="card-cta" type="button" onClick={() => setTab("chat")}>去聊天<ChevronRight size={16} /></button><div className="card-reward">没有语音 · 不连接网络</div></article>
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div className="memory-page">
            <div className="page-heading"><span className="eyebrow">A LITTLE MEMORY GAME</span><h1>翻开两张相同的卡片</h1><p>找齐 6 对就能完成；每天首次完成可领固定奖励。</p></div>
            <section className="memory-shell" aria-label="记忆翻牌游戏">
              <header className="memory-status"><div><strong>配对 {memoryGame.matchedPairs}/6</strong><span>翻牌次数 {memoryGame.moves}</span></div><button className="memory-restart" type="button" onClick={restartMemoryGame}><RotateCcw size={15} />重新开始</button></header>
              <div className={"memory-board feedback-" + memoryFeedback} role="group" aria-label="12 张记忆卡片">
                {memoryGame.cards.map((card, index) => {
                  const pair = MEMORY_PAIRS.find((item) => item.id === card.pairId);
                  const revealed = card.faceUp || card.matched;
                  const mismatch = memoryGame.locked && memoryGame.opened.includes(index);
                  return <button key={card.id} className={"memory-card " + (revealed ? "revealed " : "") + (card.matched ? "matched " : "") + (mismatch ? "mismatch" : "")} type="button" disabled={memoryGame.locked || card.matched || revealed} aria-label={revealed ? pair.label : "卡片 " + (index + 1)} aria-pressed={revealed} onClick={() => flipCard(index)}><span>{revealed ? pair.face : "✧"}</span></button>;
                })}
              </div>
              <p className={"memory-message " + (memoryGame.complete ? "complete " : "") + "feedback-" + memoryFeedback} role="status">{memoryGame.complete ? memoryRewardMessage || "配对成功，给你一个抱抱。" : memoryGame.locked ? "这两张不一样，再记住它们的位置哦。" : memoryFeedback === "matched" ? "配对成功，星星闪起来啦！" : "慢慢找，不用着急。"}</p>
              <div className="memory-reward"><Sparkles size={14} /> 完成奖励 · 经验 +15 · 星星 +2 · 每天一次</div>
            </section>
          </div>
        )}

        {tab === "actions" && (
          <div className="actions-page"><div className="page-heading"><span className="eyebrow">MOTION LIBRARY</span><h1>她的动作收藏</h1><p>共 {COLLECTION_ACTIONS.length} 组动作 · 已收录 {collectedActions.size} 组；猜拳会在桌面亮出石头、剪刀或布。</p></div><div className="action-grid">{PET_ACTIONS.map((action) => {
            const fallback = customAtlas && action.sprite ? ATLAS_ACTION_FALLBACKS[action.id] : null;
            return <button key={action.id} className="action-card" type="button" onClick={() => playAndCollectAction(action.id)}><div className="action-preview">{fallback
              ? <AtlasFrame row={fallback.row} frames={fallback.frames} loopMs={fallback.loopMs} label={action.label} outfit={equipped.outfit} accessories={equipped.accessories} anchors={atlasAnchors} />
              : <AtlasFrame row={action.row} sprite={action.sprite} columns={action.columns} sheetRows={action.sheetRows} frames={action.frames} frameSequence={action.frameSequence} gestureChoice={action.gestureChoice} loopMs={action.loopMs} label={action.label} outfit={equipped.outfit} accessories={equipped.accessories} anchors={atlasAnchors} />}</div><span className="action-group">{action.group}</span><strong>{action.label}</strong><small>{collectedActions.has(action.id) ? "已收录" : `${action.frames} 帧动画 · 点击收录`}</small></button>;
          })}{LEGACY_ACTIONS.map(({ id, label, Icon }) => {
            const stateFallback = customAtlas ? ATLAS_STATE_FALLBACKS[id] : null;
            return <button key={id} className="action-card legacy-action" type="button" onClick={() => playAndCollectAction(id)}><div className="action-preview">{stateFallback
              ? <AtlasFrame row={stateFallback.row} frames={stateFallback.frames} loopMs={stateFallback.loopMs} label={label} outfit={equipped.outfit} accessories={equipped.accessories} anchors={atlasAnchors} />
              : <img src={`./assets/sprites/${id}.png`} alt="" />}</div><span className="action-group">原有动作</span><strong><Icon size={15} />{label}</strong><small>{collectedActions.has(id) ? "已收录" : "保留旧版素材 · 点击收录"}</small></button>;
          })}</div></div>
        )}

        {tab === "collection" && (
          <div className="collection-page">
            <div className="page-heading"><span className="eyebrow">YOUR LITTLE COLLECTION</span><h1>一路陪伴留下的收藏</h1><p>星星兑换喜欢的衣服和配饰；亲密度越高，可选的款式越多。</p></div>
            {interactionFeedback && <p className="interaction-feedback" role="status">{interactionFeedback}</p>}
            <section
              className={"custom-atlas-section" + (atlasDragOver ? " drag-over" : "")}
              onDragOver={(event) => { event.preventDefault(); setAtlasDragOver(true); }}
              onDragLeave={() => setAtlasDragOver(false)}
              onDrop={(event) => { setAtlasDragOver(false); handleAtlasDrop(event); }}
            >
              <header>
                <h2><ImagePlus size={17} />我的形象</h2>
                <p>上传照片，本地自动抠图，让她以你想要的样子住在桌面上。照片只在本机处理，不会被上传，也不会离开这台电脑。</p>
                <span>{atlasMode === "lite" ? "照片形象" : atlasMode === "atlas" ? "完整图集" : "默认形象"}</span>
              </header>
              <div className="qpet-block guide-block">
                <strong>专属形象向导（免费，推荐）</strong>
                <p>独立的分层向导：第 1 层用提示词把照片变成 Q 版角色，第 2 层生成 7 张动作条带，第 3 层上传后本机一键拼装安装。生成图片用哪个工具由你决定（很多免费），生成后桌宠完全由你自己的图片构成，男生女生的照片都可以。</p>
                <div className="lite-wizard-actions">
                  <button type="button" className="lite-install-cta" onClick={startGuideAssembly}>打开专属形象向导</button>
                  {atlasMode !== "default" && <button type="button" className="lite-pick-label" onClick={resetAtlasToDefault}><RotateCcw size={15} />恢复默认形象</button>}
                </div>
              </div>
              {atlasMode === "atlas" && (
                <div className="closet-block">
                  <div className="closet-head">
                    <div><strong>形象柜</strong><small>每次生成的形象都会自动存进来，随时一键切换；已生成的换装跟着形象走。</small></div>
                    <button type="button" disabled={closetBusy} onClick={saveCurrentLook}>保存当前形象</button>
                  </div>
                  {closetSlots.length ? (
                    <div className="closet-grid">
                      {closetSlots.map((slot) => (
                        <article key={slot.id} className="closet-slot">
                          <span className="closet-thumb" style={{ backgroundImage: `url("./assets/custom/closet/${slot.id}.png")` }} aria-hidden="true" />
                          <div className="closet-copy"><strong>{slot.name}</strong></div>
                          <div className="closet-actions">
                            <button type="button" disabled={closetBusy} onClick={() => switchClosetSlot(slot.id)}>穿上</button>
                            <button type="button" className="closet-delete" disabled={closetBusy} onClick={() => deleteClosetSlot(slot.id)}>删除</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="closet-empty">还没有保存的形象。用向导生成一个，或点「保存当前形象」把现在的样子存起来。</p>
                  )}
                </div>
              )}
              <details className="lite-simple">
                <summary>简易版：照片直接秒变（本地抠图，动作较简单、边缘较粗）</summary>
                <div className="lite-photo-list">
                {litePhotos.map((photo, index) => (
                  <article key={photo.previewUrl} className="lite-photo-row">
                    <span className="lite-photo-thumb"><img src={photo.previewUrl} alt="" /></span>
                    <div className="lite-photo-copy"><strong>{photo.name}</strong><small>抠图在本机完成，约几秒一张</small></div>
                    <select className="lite-role-select" value={photo.role} onChange={(event) => changeLiteRole(index, event.target.value)} aria-label="照片姿势类型">
                      <option value="">选择姿势…</option>
                      {LITE_ROLE_OPTIONS.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                    </select>
                    <button type="button" className="lite-remove" onClick={() => removeLitePhoto(index)} aria-label="移除照片">×</button>
                  </article>
                ))}
              </div>
              <div className="lite-wizard-actions">
                <label className="lite-pick-label">
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleLiteFiles} />
                  选择照片
                </label>
                <button type="button" className="lite-install-cta" disabled={liteBusy || !litePhotos.length} onClick={installLitePhotos}>{liteBusy ? "抠图中…" : "生成我的桌宠"}</button>
                {atlasMode !== "default" && <button type="button" onClick={resetAtlasToDefault}><RotateCcw size={15} />恢复默认形象</button>}
              </div>
              </details>
              {atlasMessage && <p className="interaction-feedback" role="status">{atlasMessage}</p>}
              <details className="lite-advanced">
                <summary>高级：导入完整 8×11 动作图集 PNG（社区形象包）</summary>
                <div className="custom-atlas-actions">
                  <button type="button" onClick={chooseAtlasFile}><ImagePlus size={15} />选择图集 PNG…</button>
                </div>
                <small>图集需为 8 列 × 11 行、1536×2288 像素的 PNG；逐格动作规范见项目 docs/ATLAS-FORMAT.md。也可以把图集 PNG 直接拖进这一块。</small>
              </details>
            </section>
            <section className="wardrobe-section">
              <header className="wardrobe-heading"><div><h2><Sparkles size={17} />衣橱</h2><p>试穿预览和桌面浮窗同步。衣服会贴合角色每个动作和视线方向。</p></div><div className="wardrobe-balance"><span>亲密度 <b>{save.stats.affection}</b></span><span>星星 <b>{save.currencies.stars}</b></span></div></header>
              {atlasMode === "lite" ? (
                <div className="wardrobe-lite-note">当前使用的是照片简易形象：衣橱和配饰需要完整的动作图集。可以用上面的「专属形象向导」生成完整形象来解锁换装，或「恢复默认形象」。</div>
              ) : (
              <div className="wardrobe-grid">
                {COSMETIC_ITEMS.map((item) => {
                  const customOutfitPending = atlasMode === "atlas" && item.type === "outfit" && !outfitVariants.includes(item.outfit);
                  const owned = save.progression.collection.includes(item.id);
                  const wearing = item.type === "outfit"
                    ? equipped.outfit === item.outfit && (item.outfit === "default" || !customOutfitPending)
                    : equipped.accessories[item.slot] === item.id;
                  const affectionLocked = save.stats.affection < item.affection;
                  const canBuy = !owned && !affectionLocked && save.currencies.stars >= item.price;
                  const previewOutfit = item.type === "outfit" ? item.outfit : equipped.outfit;
                  const previewAccessories = item.type === "accessory" ? { ...equipped.accessories, [item.slot]: item.id } : equipped.accessories;
                  const subtitle = customOutfitPending
                    ? "未生成 · 用你的角色生成这套"
                    : owned
                      ? (wearing ? "正在穿戴" : "点击试穿")
                      : affectionLocked ? "亲密度 " + item.affection + " 解锁"
                        : "星星 " + item.price + " · 亲密度 " + item.affection;
                  return (
                    <article key={item.id} className={"wardrobe-card " + (wearing ? "equipped" : "") + (customOutfitPending ? " pending" : "") + (!owned && !canBuy && !customOutfitPending ? " unavailable" : "")}>
                      <div className="wardrobe-preview"><AtlasFrame row={3} frames={4} loopMs={1180} label={item.name + "试穿预览"} outfit={previewOutfit} accessories={previewAccessories} anchors={atlasAnchors} /></div>
                      <div className="wardrobe-item-copy"><strong>{item.name}</strong><small>{subtitle}</small></div>
                      {customOutfitPending ? (
                        <button type="button" onClick={() => startGuideAssembly(item.outfit)}>生成这套</button>
                      ) : (
                        <button type="button" disabled={!owned && !canBuy} onClick={() => chooseCosmetic(item)}>
                          {owned ? wearing ? "已穿上" : "穿上" : affectionLocked ? "待解锁" : save.currencies.stars < item.price ? "星星不足" : "兑换"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              )}
              <div className="accessory-slot-controls" aria-label="配饰部位管理">{[["head", "头部"], ["neck", "颈部"], ["prop", "肩挂"]].map(([slot, label]) => <button key={slot} type="button" disabled={equipped.accessories[slot] === "none" || atlasMode === "lite"} onClick={() => removeAccessory(slot)}>取下{label}</button>)}</div>
            </section>
            <section className="action-collection-section">
              <header><h2><Gamepad2 size={17} />动作收藏册</h2><p>触发过的动作会记在这里；点卡片可以再次播放并收录。</p><span>{collectedActions.size}/{COLLECTION_ACTIONS.length}</span></header>
              <div className="action-collection-grid">{COLLECTION_ACTIONS.map(({ id, label, group }, index) => {
                const collected = collectedActions.has(id);
                const legacy = LEGACY_ACTIONS.find((action) => action.id === id);
                const Icon = legacy?.Icon || (id.startsWith("rps-") ? Gamepad2 : Sparkles);
                return <button key={id} data-action-id={id} className={`action-collection-card ${collected ? "collected" : ""}`} type="button" onClick={() => { playAndCollectAction(id); setMotionEvent((current) => ({ selector: `.action-collection-card[data-action-id="${id}"]`, token: current.token + 1 })); }}><span className="collection-action-icon"><Icon size={16} /></span><strong>{label}</strong><small>{group}</small><i>{collected ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</i></button>;
              })}</div>
            </section>
            <section className="badge-section collection-badges"><h2><Trophy size={17} />纪念徽章</h2><div className="badge-list">{BADGES.map(([id, name, description]) => <article key={id} className={"badge-item " + (unlockedBadges.has(id) ? "earned" : "")}><span className="badge-icon"><Award size={19} /></span><div><strong>{name}</strong><small>{description}</small></div>{unlockedBadges.has(id) ? <Check size={16} /> : <span className="badge-lock">未获得</span>}</article>)}</div></section>
          </div>
        )}

        {tab === "chat" && (
          <div className="chat-page"><section className="chat-shell"><header><div className="chat-avatar"><AtlasFrame row={0} frames={7} loopMs={1300} label="桌宠待机" /></div><div><strong>小小的她</strong><small>本地文字互动 · 不联网 · 无语音</small></div><span className="privacy-mark"><i />仅此设备</span></header><div className="chat-transcript" aria-live="polite">{chatMessages.map((message, index) => <div key={`${index}-${message.from}`} className={`chat-line ${message.from}`}><span>{message.text}</span></div>)}</div><div className="chat-suggestions">{CHAT_QUICK_REPLIES.map((reply) => <button key={reply} type="button" onClick={() => sendMessage(reply)}>{reply}</button>)}</div><form className="chat-compose" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="给她留一句话……" maxLength={120} aria-label="输入文字" /><span>{chatInput.length}/120</span><button type="submit" disabled={!chatInput.trim()} aria-label="发送文字"><MessageCircle size={17} />发送</button></form><p className="chat-footnote">回应由本地关键词规则生成，不是联网 AI 对话。关闭面板后本轮聊天记录会清空。</p></section></div>
        )}
      </section>
    </main>
  );
}
