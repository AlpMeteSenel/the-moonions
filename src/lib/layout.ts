"use client";

import { create } from "zustand";

/** Which side panels / map cards are collapsed (remembered in this browser). */
type Key = "left" | "right" | "legend";
const STORE_KEY = "planbanana.collapsed";

function load(): Record<Key, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return { left: !!v.left, right: !!v.right, legend: !!v.legend };
  } catch {
    return { left: false, right: false, legend: false };
  }
}

export const useLayout = create<{ collapsed: Record<Key, boolean>; toggle: (k: Key) => void; hydrate: () => void }>((set, get) => ({
  collapsed: { left: false, right: false, legend: false },
  toggle: (k) => {
    const collapsed = { ...get().collapsed, [k]: !get().collapsed[k] };
    set({ collapsed });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collapsed));
    } catch {
      /* private mode: not remembered */
    }
  },
  hydrate: () => set({ collapsed: load() }),
}));

export const useCollapsed = (k: Key) => useLayout((s) => s.collapsed[k]);
