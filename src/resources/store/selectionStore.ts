import { create } from "zustand";

/**
 * selectionStore (plan §3.2, created in P5) — the reactive mirror of the currently
 * selected instance in the THREE scene. The old client had NO store for this: the
 * interaction handler drove the attribute GUI purely through the `updateAttributeGui`
 * / `removeAttributeGui` event-bus channels and the DOM. Those channels still exist
 * (P8 AttributeWindow subscribes to them for the "re-render everything" signal), but
 * React components read the *identity* of the selection from this store.
 *
 * The engine is the source of truth (globalObject.current_class_instance /
 * current_port_instance); this store is written ONE WAY by the interaction handler
 * (engine -> store), the same relationship stateStore has with globalStateObject.
 * Never write engine state from a React subscriber to this store.
 *
 * `revision` is bumped whenever an in-place mutation of the selected instance's
 * object graph must force a re-render even though `selectedInstanceUuid` did not
 * change (e.g. an attribute edit) — mirrors the metamodeling `reref`/`commit`
 * pattern (plan §3.1). Call `bump()` after such a mutation.
 */
export type SelectionType = "class" | "relationclass" | "port" | null;

export interface SelectionState {
  /** UUID of the selected class / relationclass / port instance, or null when nothing is selected. */
  selectedInstanceUuid: string | null;
  /** Which kind of instance `selectedInstanceUuid` refers to. */
  selectedType: SelectionType;
  /** Bumped on every in-place mutation of the selected instance so subscribers re-render. */
  revision: number;

  /** Record a new selection (engine -> store). */
  setSelection: (uuid: string | null, type: SelectionType) => void;
  /** Clear the selection (engine -> store). */
  clearSelection: () => void;
  /** Force subscribers to re-read the selected instance after an in-place mutation. */
  bump: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedInstanceUuid: null,
  selectedType: null,
  revision: 0,

  setSelection: (uuid, type) =>
    set((s) => ({
      selectedInstanceUuid: uuid,
      selectedType: type,
      revision: s.revision + 1,
    })),

  clearSelection: () =>
    set((s) => ({
      selectedInstanceUuid: null,
      selectedType: null,
      revision: s.revision + 1,
    })),

  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));
