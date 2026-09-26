import { useCallback, useEffect, useRef, useState } from "react";
import { SAVE_KEY, LEGACY_STATS_KEY, applyProgressEvent, loadSaveFromStorage, migrateSave } from "./progression.js";

function localLoad() {
  return loadSaveFromStorage(window.localStorage);
}

export function useProgressSave() {
  const [save, setSave] = useState(() => typeof window === "undefined" ? migrateSave(null) : localLoad());
  const saveRef = useRef(save);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};
    const initialize = async () => {
      if (window.pet?.loadSave) {
        const persisted = await window.pet.loadSave();
        if (persisted) {
          if (mounted) {
            saveRef.current = persisted;
            setSave(persisted);
          }
        } else {
          const migrated = migrateSave(
            window.localStorage.getItem(SAVE_KEY),
            window.localStorage.getItem(LEGACY_STATS_KEY),
          );
          const seeded = await window.pet.seedSave?.(migrated);
          const initial = seeded || migrated;
          if (mounted) {
            saveRef.current = initial;
            setSave(initial);
          }
        }
        unsubscribe = window.pet.onSaveChanged?.((next) => {
          saveRef.current = next;
          if (mounted) setSave(next);
        }) || unsubscribe;
        return;
      }
      const local = localLoad();
      saveRef.current = local;
      if (mounted) setSave(local);
      const onStorage = (event) => {
        if (event.key !== SAVE_KEY) return;
        const next = localLoad();
        saveRef.current = next;
        setSave(next);
      };
      window.addEventListener("storage", onStorage);
      unsubscribe = () => window.removeEventListener("storage", onStorage);
    };
    initialize().catch(() => {
      if (!mounted) return;
      const fallback = localLoad();
      saveRef.current = fallback;
      setSave(fallback);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const record = useCallback((event) => {
    const run = async () => {
      let result;
      if (window.pet?.applyProgressEvent) {
        result = await window.pet.applyProgressEvent(event);
      } else {
        const raw = window.localStorage.getItem(SAVE_KEY);
        const current = raw ? migrateSave(raw, window.localStorage.getItem(LEGACY_STATS_KEY)) : saveRef.current;
        result = applyProgressEvent(current, event);
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(result.save));
      }
      saveRef.current = result.save;
      setSave(result.save);
      return result;
    };
    const next = queueRef.current.catch(() => undefined).then(run);
    queueRef.current = next;
    return next;
  }, []);

  return { save, record };
}
