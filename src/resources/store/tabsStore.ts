import { create } from "zustand";

// Reactive half of the tab bar. Replaces main-body-tab-bar.ts' local state plus
// `globalObjectInstance.selectedTab`. Each entry mirrors one open SceneInstance
// tab; the engine's `globalObject.tabContext[]` (created in P2/P3) holds the
// matching THREE.Scene / dragObjects for the same index.
//
// SINGLE MUTATION PATH: once the engine exists, openTab/closeTab/selectTab here
// must also mutate `globalObject.tabContext` + `globalObject.selectedTab` so the
// two never drift. The engine wiring is deferred to P3 (instance-utility's
// createTabContextSceneInstance drives this store); P1 only owns the React state.
// See plan.md §3.1 "single mutation path" and P6 for the exact closeTab rules.

export interface TabInfo {
  /** SceneInstance name shown on the tab. */
  name: string;
  /** SceneInstance uuid — stable key for React and for locating the tab. */
  uuid: string;
  /** True once >=2 access entries make the scene collaborative (P10). */
  isShared: boolean;
}

interface TabsState {
  tabs: TabInfo[];
  /** Index of the active tab, or -1 when no tab is open. */
  selectedTab: number;

  /** Append a tab and select it; returns its index. */
  openTab: (tab: TabInfo) => number;
  /** Close the tab at `index`, adjusting the selection like the old closeTab. */
  closeTab: (index: number) => void;
  /** Activate an existing tab by index. */
  selectTab: (index: number) => void;
  /** Rename the tab at `index` (its SceneInstance name shown on the tab). */
  renameTab: (index: number, name: string) => void;
  /** Mark a tab shared/unshared (used when collaboration attaches, P10). */
  setTabShared: (index: number, isShared: boolean) => void;
}

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [],
  selectedTab: -1,

  openTab: (tab) => {
    let newIndex = -1;
    set((s) => {
      newIndex = s.tabs.length;
      return { tabs: [...s.tabs, tab], selectedTab: newIndex };
    });
    return newIndex;
  },

  closeTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      const tabs = s.tabs.filter((_, i) => i !== index);
      // Mirror the old main-body-tab-bar.closeTab selection rules: keep a valid
      // selection, clamp to the last tab, and drop to -1 when nothing is left.
      let selectedTab = s.selectedTab;
      if (tabs.length === 0) {
        selectedTab = -1;
      } else if (index < s.selectedTab) {
        selectedTab = s.selectedTab - 1;
      } else if (index === s.selectedTab) {
        selectedTab = Math.min(index, tabs.length - 1);
      }
      return { tabs, selectedTab };
    }),

  selectTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { selectedTab: index };
    }),

  renameTab: (index, name) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { tabs: s.tabs.map((t, i) => (i === index ? { ...t, name } : t)) };
    }),

  setTabShared: (index, isShared) =>
    set((s) => ({
      tabs: s.tabs.map((t, i) => (i === index ? { ...t, isShared } : t)),
    })),
}));
