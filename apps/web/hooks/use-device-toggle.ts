"use client";

import { useCallback, useSyncExternalStore } from "react";

// A yes/no preference kept on this device only (localStorage) — e.g. one
// counter wants photo tiles on the POS, another wants names. Every
// component using the same key stays in sync, including across tabs.
const EVENT = "fcartel:device-toggle";

function read(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function useDeviceToggle(key: string, fallback = false): [boolean, (next: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode: the toggle just won't persist */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
