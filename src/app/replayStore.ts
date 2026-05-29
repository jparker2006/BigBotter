"use client";

import { create } from "zustand";

type ReplayState = {
  cursor: number;
  isPlaying: boolean;
  godMode: boolean;
  setCursor: (cursor: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  rewind: () => void;
  advance: (max: number, keepPlaying?: boolean) => void;
  toggleGodMode: () => void;
};

export const useReplayStore = create<ReplayState>((set) => ({
  cursor: 0,
  isPlaying: false,
  godMode: true,
  setCursor: (cursor) => set({ cursor: Math.max(0, cursor) }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  reset: () => set({ cursor: 0, isPlaying: false }),
  rewind: () => set((state) => ({ cursor: Math.max(0, state.cursor - 1), isPlaying: false })),
  // keepPlaying=true keeps the player "live" at the frontier while a season is still streaming
  // in, so it resumes automatically as new events arrive instead of pausing at the end.
  advance: (max, keepPlaying = false) =>
    set((state) => {
      const next = Math.min(max, state.cursor + 1);
      return { cursor: next, isPlaying: state.isPlaying && (keepPlaying || next < max) };
    }),
  toggleGodMode: () => set((state) => ({ godMode: !state.godMode })),
}));
