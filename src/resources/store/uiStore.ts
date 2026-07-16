import { create } from "zustand";

// Replaces the Aurelia DialogHelper (resources/dialog_helper.ts) + the MDC dialog
// refs each view kept, and the old `openDialog*` EventAggregator channels. Every
// dialog in the app is opened/closed through this single store: components read
// `dialogs[name]` to know whether to render open, and imperative code calls
// `openDialog(name, payload)` / `closeDialog(name)` instead of publishing an
// `openDialog*` event.
//
// Payload-carrying dialogs (createNewScene<SceneType>, shareScene, copyScene,
// deleteScene, referenceAttribute, tableAttribute, upload*) stash their payload
// in `dialogPayloads[name]`; the owning view reads it with `getDialogPayload`.
// Payload types firm up in the phase that ports each dialog (P7-P10) — kept
// loose (`unknown`) here so P1 does not depend on not-yet-ported view code.

export type DialogName =
  | "saveAs"
  | "importModel"
  | "importMetamodel"
  | "mapFromFile"
  | "algorithm"
  | "createNewScene"
  | "copyScene"
  | "deleteScene"
  | "shareScene"
  | "userInfo"
  | "referenceAttribute"
  | "tableAttribute"
  | "uploadFile"
  | "uploadGltf"
  | "uploadImage";

const DIALOG_NAMES: DialogName[] = [
  "saveAs",
  "importModel",
  "importMetamodel",
  "mapFromFile",
  "algorithm",
  "createNewScene",
  "copyScene",
  "deleteScene",
  "shareScene",
  "userInfo",
  "referenceAttribute",
  "tableAttribute",
  "uploadFile",
  "uploadGltf",
  "uploadImage",
];

function allClosed(): Record<DialogName, boolean> {
  return DIALOG_NAMES.reduce(
    (acc, name) => {
      acc[name] = false;
      return acc;
    },
    {} as Record<DialogName, boolean>,
  );
}

interface UiState {
  dialogs: Record<DialogName, boolean>;
  dialogPayloads: Partial<Record<DialogName, unknown>>;
  /** Drives the loading-window dialog (MUI LinearProgress). */
  loading: boolean;
  /** Reactive mirror of globalObject.autoSave (the engine field is authoritative). */
  autoSave: boolean;

  openDialog: (name: DialogName, payload?: unknown) => void;
  closeDialog: (name: DialogName) => void;
  getDialogPayload: <T = unknown>(name: DialogName) => T | undefined;
  setLoading: (value: boolean) => void;
  setAutoSave: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  dialogs: allClosed(),
  dialogPayloads: {},
  loading: false,
  autoSave: true,

  openDialog: (name, payload) =>
    set((s) => ({
      dialogs: { ...s.dialogs, [name]: true },
      dialogPayloads: { ...s.dialogPayloads, [name]: payload },
    })),

  closeDialog: (name) =>
    set((s) => ({
      dialogs: { ...s.dialogs, [name]: false },
    })),

  getDialogPayload: <T = unknown>(name: DialogName) =>
    get().dialogPayloads[name] as T | undefined,

  setLoading: (value) => set({ loading: value }),
  setAutoSave: (value) => set({ autoSave: value }),
}));
