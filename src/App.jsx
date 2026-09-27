import { useCallback, useEffect, useRef, useState } from "react";
import {
  Armchair,
  EyeOff,
  Footprints,
  Gamepad2,
  Heart,
  LayoutDashboard,
  Moon,
  X,
} from "lucide-react";
import { autoStateForIdleTime } from "./petMachine.js";
import { useProgressSave } from "./useProgressSave.js";
import { ATLAS_ACTION_FALLBACKS, ATLAS_STATE_FALLBACKS, PET_ACTIONS, directionForGaze, gazeIndexFromPoint } from "./actionRegistry.js";
import { AtlasFrame } from "./AtlasFrame.jsx";
import { LitePetSprite } from "./LitePetSprite.jsx";
import { createDragSession, updateDragSession } from "./dragSession.js";
import { createFrameCoalescer } from "./dragCoalescer.js";

const sprites = {
  idle: "./assets/sprites/idle.png",
  blink: "./assets/sprites/blink.png",
  "walk-left": "./assets/sprites/walk-left.png",
  "walk-right": "./assets/sprites/walk-right.png",
  sit: "./assets/sprites/sit.png",
  sleep: "./assets/sprites/sleep.png",
  happy: "./assets/sprites/happy.png",
  drag: "./assets/sprites/drag.png",
};

const clickMessages = ["我在呀", "今天也辛苦啦", "陪你一会儿", "看到你啦"];

export function App() {
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { save, record } = useProgressSave();
  const [atlasActionId, setAtlasActionId] = useState("idle");
  const [actionEffect, setActionEffect] = useState("");
  const [gazeIndex, setGazeIndex] = useState(0);
  const [appearanceMode, setAppearanceMode] = useState("default");
  const [outfitVariants, setOutfitVariants] = useState([]);
  const [atlasAnchors, setAtlasAnchors] = useState(null);
  const [liteManifest, setLiteManifest] = useState(null);
  const lastInteraction = useRef(Date.now());
  const temporaryTimer = useRef(null);
  const drag = useRef(null);
  const dragMovement = useRef(null);
  if (!dragMovement.current) {
    dragMovement.current = createFrameCoalescer((movement) => {
      window.pet?.moveBy?.(movement.dx, movement.dy, movement.inputAt, movement.pointerPoint);
    });
  }
  const dragHandlers = useRef(null);
  const walkTimer = useRef(null);
  const clickIndex = useRef(0);
  const restState = useRef(null);
  const activeRpsRound = useRef(null);

  const playAtlasAction = (requestedActionId, override = null) => {
    const aliases = {
      wake: { actionId: "celebrate", effect: "wake", message: "醒啦，继续陪你" },
      feed: { actionId: "feed", effect: "feed", message: "她吃得好开心" },
      pet: { actionId: "pet", effect: "pet", message: "被摸摸头啦" },
      hug: { actionId: "hug", effect: "hug", message: "抱抱收到啦" },
      "rps-win": { actionId: "celebrate", effect: "rps-win", message: "猜拳赢啦，开心庆祝！" },
      "rps-draw": { actionId: "heart", effect: "rps-draw", message: "平局啦，和你击个掌" },
      "rps-lose": { actionId: "shy", effect: "rps-lose", message: "这局她赢啦，下次再来" },
    };
    const interaction = override || aliases[requestedActionId];
    const actionId = interaction?.actionId || requestedActionId;
    const action = PET_ACTIONS.find((item) => item.id === actionId);
    if (!action) return;
    window.clearTimeout(temporaryTimer.current);
    window.clearInterval(walkTimer.current);
    walkTimer.current = null;
    setAtlasActionId(action.id);
    setState("atlas-action");
    setActionEffect(interaction?.effect || "");
    setMessage(interaction?.message || action.label);
    restState.current = null;
    markInteraction();
    temporaryTimer.current = window.setTimeout(() => {
      setState("idle");
      setAtlasActionId("idle");
      setActionEffect("");
      setMessage("");
      restState.current = null;
    }, interaction?.durationMs || action.loopMs);
  };

  useEffect(() => {
    window.pet?.setInteractionMode?.({ menuOpen });
  }, [menuOpen]);

  useEffect(() => {
    window.pet?.customAtlasStatus?.().then((status) => {
      setAppearanceMode(status?.mode || "default");
      setLiteManifest(status?.mode === "lite" ? (status.manifest || { images: {} }) : null);
      setOutfitVariants(Array.isArray(status?.outfitVariants) ? status.outfitVariants : []);
      setAtlasAnchors(status?.anchors || null);
    }).catch(() => {});
  }, []);

  useEffect(() => window.pet?.onActionRequest?.((request) => {
    if (request && typeof request === "object" && request.type === "rps") {
      if (request.phase === "cancel") {
        if (activeRpsRound.current !== request.roundId) return;
        activeRpsRound.current = null;
        window.clearTimeout(temporaryTimer.current);
        setAtlasActionId("idle");
        setActionEffect("");
        setMessage("");
        setState("idle");
      } else if (request.phase === "countdown") {
        activeRpsRound.current = request.roundId;
        playAtlasAction("waiting", { effect: "rps-countdown", message: String(request.count), durationMs: 560 });
      } else if (request.phase === "reveal" && activeRpsRound.current === request.roundId) {
        const choiceAction = `rps-${request.petChoice}`;
        const choiceName = { rock: "石头", scissors: "剪刀", paper: "布" }[request.petChoice];
        if (choiceName) playAtlasAction(choiceAction, { effect: choiceAction, message: `我出${choiceName}！`, durationMs: 1180 });
      } else if (request.phase === "result" && activeRpsRound.current === request.roundId) {
        activeRpsRound.current = null;
        playAtlasAction(`rps-${request.outcome}`);
      }
      return;
    }
    if (request === "sit" || request === "sleep") chooseRestState(request);
    else if (request === "wake") wakeUp();
    else if (request === "walk") startWalk();
    else playAtlasAction(request);
  }), []);

  useEffect(() => {
    let active = true;
    const updateGaze = async () => {
      if (drag.current) return;
      const [bounds, point] = await Promise.all([
        window.pet?.getBounds?.(),
        window.pet?.cursorPoint?.(),
      ]);
      if (!active || !bounds || !point) return;
      const nextIndex = gazeIndexFromPoint(
        { x: bounds.x + bounds.width / 2, y: bounds.y + 112 },
        point,
      );
      setGazeIndex((current) => current === nextIndex ? current : nextIndex);
    };
    updateGaze();
    const timer = window.setInterval(updateGaze, 160);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const markInteraction = useCallback(() => {
    lastInteraction.current = Date.now();
  }, []);

  const showTemporaryState = useCallback((nextState, nextMessage = "", duration = 1300) => {
    window.clearTimeout(temporaryTimer.current);
    window.clearInterval(walkTimer.current);
    walkTimer.current = null;
    restState.current = null;
    setState(nextState);
    setMessage(nextMessage);
    markInteraction();
    temporaryTimer.current = window.setTimeout(() => {
      setState("idle");
      setMessage("");
    }, duration);
  }, [markInteraction]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (drag.current || walkTimer.current || restState.current) return;
      const nextState = autoStateForIdleTime(Date.now() - lastInteraction.current);
      setState((current) => {
        if (["happy", "drag", "walk-left", "walk-right", "blink", "atlas-action"].includes(current)) {
          return current;
        }
        return nextState;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let timeout;
    const scheduleBlink = () => {
      timeout = window.setTimeout(() => {
        if (!drag.current && !walkTimer.current && state === "idle") {
          setState("blink");
          window.setTimeout(() => setState("idle"), 180);
        }
        scheduleBlink();
      }, 2800 + Math.random() * 2600);
    };
    scheduleBlink();
    return () => window.clearTimeout(timeout);
  }, [state]);

  useEffect(() => () => {
    window.clearTimeout(temporaryTimer.current);
    window.clearInterval(walkTimer.current);
    dragMovement.current?.cancel();
    if (drag.current) {
      if (drag.current.startedWindowDrag) window.pet?.endDrag?.();
      drag.current = null;
    }
  }, []);

  const startWindowDrag = (activeDrag) => {
    if (activeDrag.startedWindowDrag) return;
    activeDrag.startedWindowDrag = true;
    window.pet?.startDrag?.();
    setState("drag");
    setMessage("");
    markInteraction();
  };

  const sendDragMovement = (activeDrag) => {
    if (drag.current !== activeDrag || !activeDrag.started) return;
    dragMovement.current?.schedule({
      dx: activeDrag.latestDelta.x,
      dy: activeDrag.latestDelta.y,
      inputAt: activeDrag.latestEventAt,
      pointerPoint: activeDrag.latestPointerPoint,
    });
  };

  const flushDragMovement = (activeDrag) => {
    sendDragMovement(activeDrag);
    dragMovement.current?.flush();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    restState.current = null;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Global pointer listeners below keep the drag usable if capture is unavailable.
    }
    const activeDrag = createDragSession(event);
    drag.current = activeDrag;
  };

  const onPointerMove = (event) => {
    const activeDrag = drag.current;
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const wasStarted = activeDrag.started;
    updateDragSession(activeDrag, event);
    if (!wasStarted && activeDrag.started) startWindowDrag(activeDrag);
    sendDragMovement(activeDrag);
  };

  const onPointerUp = (event) => {
    const activeDrag = drag.current;
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const wasStarted = activeDrag.started;
    updateDragSession(activeDrag, event);
    if (!wasStarted && activeDrag.started) startWindowDrag(activeDrag);
    flushDragMovement(activeDrag);
    activeDrag.released = true;
    drag.current = null;
    if (activeDrag.startedWindowDrag) window.pet?.endDrag?.();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser can release capture before delivering pointerup.
    }
    if (activeDrag.started) {
      showTemporaryState("happy", "放在这里吗？", 1000);
      return;
    }
    record("action");
    const nextMessage = clickMessages[clickIndex.current % clickMessages.length];
    clickIndex.current += 1;
    showTemporaryState("happy", nextMessage);
  };

  const cancelPointerDrag = (event = null) => {
    const activeDrag = drag.current;
    if (!activeDrag || (event?.pointerId !== undefined && event.pointerId !== activeDrag.pointerId)) return;
    activeDrag.cancelled = true;
    activeDrag.released = true;
    flushDragMovement(activeDrag);
    drag.current = null;
    if (activeDrag.startedWindowDrag) window.pet?.endDrag?.();
    if (event?.pointerId !== undefined) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be gone */ }
    }
    setState((current) => current === "drag" ? "idle" : current);
  };

  const onLostPointerCapture = (event) => {
    const activeDrag = drag.current;
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    if (event.buttons & 1) {
      return;
    }
    cancelPointerDrag(event);
  };

  dragHandlers.current = { onPointerMove, onPointerUp, cancelPointerDrag };

  useEffect(() => {
    const cancelOnWindowLeave = () => cancelPointerDrag();
    const moveOutsideCharacter = (event) => {
      if (!drag.current || event.target?.closest?.(".character-stage")) return;
      dragHandlers.current?.onPointerMove(event);
    };
    const releaseOutsideCharacter = (event) => {
      if (!drag.current || event.target?.closest?.(".character-stage")) return;
      dragHandlers.current?.onPointerUp(event);
    };
    const cancelActiveDrag = (event) => dragHandlers.current?.cancelPointerDrag(event);
    window.addEventListener("blur", cancelOnWindowLeave);
    window.addEventListener("pagehide", cancelOnWindowLeave);
    window.addEventListener("pointermove", moveOutsideCharacter);
    window.addEventListener("pointerup", releaseOutsideCharacter);
    window.addEventListener("pointercancel", cancelActiveDrag);
    return () => {
      window.removeEventListener("blur", cancelOnWindowLeave);
      window.removeEventListener("pagehide", cancelOnWindowLeave);
      window.removeEventListener("pointermove", moveOutsideCharacter);
      window.removeEventListener("pointerup", releaseOutsideCharacter);
      window.removeEventListener("pointercancel", cancelActiveDrag);
    };
  }, []);

  const onDoubleClick = () => {
    record("action");
    showTemporaryState("happy", "最喜欢你啦", 1800);
  };

  const startWalk = () => {
    setMenuOpen(false);
    restState.current = null;
    window.clearTimeout(temporaryTimer.current);
    markInteraction();
    window.clearInterval(walkTimer.current);
    let step = 0;
    setAtlasActionId("run-right");
    setState("atlas-action");
    record("action");
    walkTimer.current = window.setInterval(() => {
      step += 1;
      const direction = step % 2 === 0 ? "run-right" : "run-left";
      setAtlasActionId(direction);
      window.pet?.nudge?.(direction === "run-right" ? 10 : -10, 0);
      if (step >= 12) {
        window.clearInterval(walkTimer.current);
        walkTimer.current = null;
        setState("idle");
        setAtlasActionId("idle");
      }
    }, 280);
  };

  const chooseRestState = (nextState) => {
    setMenuOpen(false);
    window.clearTimeout(temporaryTimer.current);
    window.clearInterval(walkTimer.current);
    walkTimer.current = null;
    restState.current = nextState;
    setMessage(nextState === "sleep" ? "晚安，等你叫醒我" : "坐下来陪你一会儿");
    setState(nextState);
    markInteraction();
  };

  const wakeUp = () => {
    restState.current = null;
    playAtlasAction("wake");
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    setMenuOpen((open) => !open);
    markInteraction();
  };

  const activeAtlasAction = PET_ACTIONS.find((action) => action.id === atlasActionId) || PET_ACTIONS[0];
  const gaze = directionForGaze(gazeIndex);
  const equipped = save.progression.equipped || { outfit: "default", accessory: "none" };
  // A custom atlas belongs to the user's own character. Wardrobe variants are
  // user-generated files, so the equipped outfit passes through when one
  // exists; without a variant (or anchors for accessories) fall back to the
  // user's own base look — never to the bundled default character art.
  const isCustomAtlas = appearanceMode === "atlas";
  const renderOutfit = isCustomAtlas && !outfitVariants.includes(equipped.outfit) ? "default" : equipped.outfit;
  const renderAccessories = isCustomAtlas && !atlasAnchors
    ? { head: "none", neck: "none", prop: "none" }
    : equipped.accessories;
  const renderAnchors = isCustomAtlas ? atlasAnchors : null;
  const gestureFallback = isCustomAtlas && activeAtlasAction.sprite ? ATLAS_ACTION_FALLBACKS[activeAtlasAction.id] : null;
  // In custom-atlas mode the bundled legacy sprites (sit/sleep/drag/happy) would
  // flash the default character, so every state maps onto the user's own atlas.
  const stateFallback = isCustomAtlas ? ATLAS_STATE_FALLBACKS[state] : null;

  return (
    <main className="pet-window" onPointerDown={() => { if (menuOpen) setMenuOpen(false); }}>
      {message && <div className="speech-bubble" role="status">{message}</div>}

      <button
        className={`character-stage state-${state}`}
        type="button"
        aria-label="桌面宠物"
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelPointerDrag}
        onLostPointerCapture={onLostPointerCapture}
        onDoubleClick={onDoubleClick}
      >
      {appearanceMode === "lite" && liteManifest ? (
        <LitePetSprite
          manifest={liteManifest}
          actionId={state === "atlas-action" ? activeAtlasAction.id : state}
          effect={actionEffect}
        />
      ) : state === "atlas-action" && gestureFallback ? (
        <AtlasFrame row={gestureFallback.row} frames={gestureFallback.frames} loopMs={gestureFallback.loopMs} className={`pet-atlas-sprite action-${actionEffect}`} label={activeAtlasAction.label} outfit={renderOutfit} accessories={renderAccessories} anchors={renderAnchors} />
      ) : state === "atlas-action" ? (
        <AtlasFrame row={activeAtlasAction.row} sprite={activeAtlasAction.sprite} columns={activeAtlasAction.columns} sheetRows={activeAtlasAction.sheetRows} frames={activeAtlasAction.frames} frameSequence={activeAtlasAction.frameSequence} gestureChoice={activeAtlasAction.gestureChoice} loopMs={activeAtlasAction.loopMs} className={`pet-atlas-sprite ${activeAtlasAction.sprite ? "sheet-action" : ""} action-${actionEffect}`} label={activeAtlasAction.label} outfit={renderOutfit} accessories={renderAccessories} anchors={renderAnchors} />
        ) : stateFallback ? (
          <AtlasFrame row={stateFallback.row} frameOffset={stateFallback.frameOffset} frames={stateFallback.frames} loopMs={stateFallback.loopMs} className="pet-atlas-sprite" label={`桌宠${state === "sleep" ? "睡觉" : state === "sit" ? "坐下" : "回应"}`} outfit={renderOutfit} accessories={renderAccessories} anchors={renderAnchors} />
        ) : state === "idle" ? (
          <AtlasFrame row={gaze.row} frameOffset={gaze.column} frames={1} className="pet-atlas-sprite" label={`桌宠看向${gaze.label}`} outfit={renderOutfit} accessories={renderAccessories} anchors={renderAnchors} />
        ) : (
          <AtlasFrame row={0} sprite={sprites[state] || sprites.idle} columns={1} sheetRows={1} frames={1} className={`pet-atlas-sprite legacy-sprite state-${state}`} label={`桌宠${state === "sleep" ? "睡觉" : state === "sit" ? "坐下" : "回应"}`} outfit={renderOutfit} accessories={renderAccessories} anchors={renderAnchors} />
        )}
        {actionEffect && <div className={`interaction-effects effect-${actionEffect}`} aria-hidden="true"><i>{actionEffect === "feed" ? "🍪" : actionEffect === "pet" ? "♡" : actionEffect === "hug" ? "♥" : actionEffect === "wake" ? "✦" : "✧"}</i><i>{actionEffect === "feed" ? "✦" : actionEffect === "pet" ? "✧" : "♡"}</i><i>{actionEffect === "hug" ? "♡" : "✦"}</i></div>}
      </button>

      <button className="play-shortcut" type="button" title="打开互动玩法" onPointerDown={(event) => { event.stopPropagation(); if (event.button === 0) { setMenuOpen(false); window.pet?.openDashboard?.("play"); } }} onClick={(event) => { if (event.detail === 0) { setMenuOpen(false); window.pet?.openDashboard?.("play"); } }}><Gamepad2 size={15} />玩法</button>

      {menuOpen && (
        <nav className="pet-menu" aria-label="桌宠菜单" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" title="玩法" aria-label="玩法" onClick={() => { setMenuOpen(false); window.pet?.openDashboard?.("play"); }}><Gamepad2 size={18} /></button>
          <button type="button" title="状态" aria-label="状态" onClick={() => { setMenuOpen(false); window.pet?.openDashboard?.("home"); }}><Heart size={18} /></button>
          <button type="button" title="陪伴面板" aria-label="打开陪伴面板" onClick={() => window.pet?.openDashboard?.()}><LayoutDashboard size={18} /></button>
          <button type="button" title="散步" aria-label="散步" onClick={startWalk}><Footprints size={18} /></button>
          <button type="button" title="坐一会儿" aria-label="坐一会儿" onClick={() => chooseRestState("sit")}><Armchair size={18} /></button>
          <button type="button" title="睡觉" aria-label="睡觉" onClick={() => chooseRestState("sleep")}><Moon size={18} /></button>
          <button type="button" title="暂时隐藏" aria-label="暂时隐藏" onClick={() => window.pet?.hide?.()}><EyeOff size={18} /></button>
          <button className="danger" type="button" title="退出" aria-label="退出" onClick={() => window.pet?.quit?.()}><X size={18} /></button>
        </nav>
      )}

    </main>
  );
}
