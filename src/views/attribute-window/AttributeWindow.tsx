import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Divider, TextField, Typography } from "@mui/material";
import type { AttributeInstance } from "@gds";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { eventBus, type UploadEventPayload } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useUiStore } from "@/resources/store/uiStore";
import {
  buildAttributeGroups,
  emptyAttributeGroups,
  type AttributeGroups,
  type EnhancedAttributeInstance,
} from "./attributeModel";
import PlainAttributeRow from "./PlainAttributeRow";
import ReferenceAttributeDialog from "./ReferenceAttributeDialog";
import TableAttributeDialog from "./TableAttributeDialog";
import UploadFileDialog from "@/views/dialogs/UploadFileDialog";
import UploadGltfDialog from "@/views/dialogs/UploadGltfDialog";
import UploadImageDialog from "@/views/dialogs/UploadImageDialog";

/**
 * P8 port of `views/attribute-window/attribute-window.{ts,html}` (351 + 182 lines).
 * Shows the attribute instances of the currently selected class / port /
 * relationclass instance, grouped into plain, table and reference attributes.
 * With nothing selected it shows the OPEN SCENE INSTANCE's own attributes instead —
 * see the scene-fallback note on `buildAttributeGroups`.
 *
 * WIRING (replaces the Aurelia `attached()` subscriptions):
 *  - `updateAttributeGui` (bus) -> rebuild the groups. The interaction handler
 *    publishes `removeAttributeGui` and then `updateAttributeGui` 10 ms later.
 *  - `removeAttributeGui` (bus) -> the old `delayedReset()`, now a delayed REBUILD:
 *    dropping the element's attributes means falling back to the scene's, not showing
 *    an empty panel.
 *  - `tabChanged` (bus) -> another tab means another scene instance, and the tab
 *    switch clears the selection without touching the attribute channels.
 *  - `useSelectionStore` (P5) -> `revision` is an ADDITIONAL rebuild trigger, so an
 *    in-place attribute mutation that calls `bump()` re-renders the window without a
 *    bus round-trip. Selection identity still comes from the engine via the bus, so
 *    the store and the channels agree.
 *
 * The old `buttons.forEach(b => b.addEventListener('click', e => e.preventDefault()))`
 * from `attached()` is dropped: it existed to stop `mdc-button`s inside the window
 * from submitting a form. MUI `Button` defaults to `type="button"`, which does not
 * submit, so there is nothing to prevent.
 *
 * `firstLevel` is kept for parity but has NO behaviour left — see AttributeWindowDialog.
 */
interface AttributeWindowProps {
  /** Old `@bindable firstLevel`. Vestigial: see AttributeWindowDialog.tsx. */
  firstLevel?: boolean;
}

export default function AttributeWindow({ firstLevel = true }: AttributeWindowProps) {
  const [groups, setGroups] = useState<AttributeGroups>(emptyAttributeGroups);
  const revision = useSelectionStore((s) => s.revision);
  const openDialog = useUiStore((s) => s.openDialog);

  // Tracks the latest rebuild so a slow one cannot overwrite a newer result, and so
  // the delayed reset can be cancelled by a rebuild that starts first.
  const runIdRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rebuild = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    const runId = ++runIdRef.current;
    void buildAttributeGroups()
      .then((next) => {
        if (runId === runIdRef.current) setGroups(next);
      })
      .catch((err) => logger.log("attribute window update failed: " + describeError(err), "error"));
  }, []);

  // Old `delayedReset()`: reset with a 10 ms delay. The original comment says the
  // delay is "needed for text mesh update since we need the context of the old
  // values"; it also lets the interaction handler's paired `updateAttributeGui`
  // (published 10 ms after `removeAttributeGui`) cancel it via `rebuild()`.
  //
  // It re-derives rather than blanking: "the selected element's attributes are gone"
  // now means "show the open scene instance's attributes", which only
  // `buildAttributeGroups` can decide. It still clears the window whenever there is
  // nothing at all to show, since that is the state it returns with no scene open.
  const delayedReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      rebuild();
    }, 10);
  }, [rebuild]);

  // Old `gltfUploaded(message)` / `imageUploaded(message)`: both did nothing but run the
  // hybrid algorithms for the uploaded attribute instance — that is what swaps an
  // ObjectSpace Augmentation's mesh for the uploaded GLTF, or re-sizes a Detectable's
  // plane for the uploaded image. P8 subscribed these channels to rebuild the FIELDS
  // instead (the value changed underneath us) and left the hybrid call for P12; both
  // now run. The attributeInstance rides along in the P8 upload payload.
  const uploaded = useCallback(
    (payload: UploadEventPayload) => {
      rebuild();
      const attributeInstance = payload?.attributeInstance as AttributeInstance | undefined;
      if (!attributeInstance) return;
      void hybridAlgorithmsService
        .checkHybridAlgorithms(attributeInstance)
        .catch((err) => logger.log("hybrid algorithms failed: " + describeError(err), "error"));
    },
    [rebuild],
  );

  useEffect(() => {
    const subs = [
      eventBus.subscribe("updateAttributeGui", rebuild),
      eventBus.subscribe("removeAttributeGui", delayedReset),
      eventBus.subscribe("gltfUploaded", uploaded),
      eventBus.subscribe("imageUploaded", uploaded),
      // fileUploaded only rebuilds: the old window never subscribed it for the hybrid
      // algorithms, and its payload carries a fileUuid rather than the instance.
      eventBus.subscribe("fileUploaded", rebuild),
      eventBus.subscribe("tableAttributeChanged", rebuild),
      // Switching (or closing) a tab swaps the scene instance whose attributes the
      // fallback shows, and clears the selection without publishing on the attribute
      // channels — see tabActions.applyEngineTabSelection.
      eventBus.subscribe("tabChanged", rebuild),
    ];
    return () => {
      subs.forEach((s) => s.dispose());
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [rebuild, delayedReset, uploaded]);

  // Rebuild when the P5 selection store changes (selection identity or a bump()).
  useEffect(() => {
    rebuild();
  }, [revision, rebuild]);

  const { currentClassInstance, currentPortInstance, currentRelationclassInstance, currentSceneInstance } =
    groups;
  const hasDynamic = groups.plain.length !== 0 || groups.table.length !== 0 || groups.reference.length !== 0;

  // `buildAttributeGroups` resolves the selected THREE object back to its class / port /
  // relationclass instance, and falls back to the open scene instance when nothing is
  // selected. All four are null only when no scene is open at all — then there is
  // nothing to display, so render nothing rather than an empty panel. All hooks above
  // run unconditionally, so this early return is safe.
  const hasInstance = Boolean(
    currentClassInstance || currentPortInstance || currentRelationclassInstance || currentSceneInstance,
  );
  if (!hasInstance) return null;

  // `openDialog(dialog, attributeInstance)` in the old view: publish the context on the
  // bus (plan §5 `openReferenceDialog`) AND open the single shared dialog. The old
  // client did exactly this pair — one dialog view reused by every reference button.
  function openReferenceDialog(enhanced: EnhancedAttributeInstance) {
    eventBus.publish("openReferenceDialog", { attributeInstance: enhanced.attributeInstance });
    openDialog("referenceAttribute", { attributeInstance: enhanced.attributeInstance });
  }

  // No scene-instance field in the payload: the dialog only uses the owner to dispatch
  // the hybrid algorithms (class / port only), and it resolves the column structure of a
  // scene-owned table attribute through metaUtility instead — see its `load()`.
  function openTableDialog(enhanced: EnhancedAttributeInstance) {
    openDialog("tableAttribute", {
      attributeInstance: enhanced.attributeInstance,
      currentClassInstance,
      currentPortInstance,
    });
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto" }}>
      {/* For the given instance display the uuid */}
      {currentClassInstance && (
        <StaticAttributes uuid={currentClassInstance.uuid} name={currentClassInstance.name} />
      )}
      {currentRelationclassInstance && (
        <StaticAttributes
          uuid={currentRelationclassInstance.uuid}
          name={currentRelationclassInstance.name}
        />
      )}
      {currentPortInstance && (
        <StaticAttributes uuid={currentPortInstance.uuid} name={currentPortInstance.name} />
      )}
      {/* nothing selected: the open scene instance itself */}
      {currentSceneInstance && (
        <StaticAttributes
          uuid={currentSceneInstance.uuid}
          name={currentSceneInstance.name}
          nameLabel="Scene"
        />
      )}

      {hasDynamic && (
        <Typography variant="h6" sx={{ mt: 0, mb: 1.5, p: 0, fontSize: "1rem", fontWeight: 600 }}>
          Dynamic Attributes
        </Typography>
      )}

      {/* for each attributeInstance that is not a tableattribute */}
      {groups.plain.map((enhanced) => (
        <PlainAttributeRow
          key={enhanced.attributeInstance.uuid}
          enhanced={enhanced}
          isFileAttribute={groups.fileTypeUuids.includes(enhanced.attributeInstance.uuid)}
          owner={groups}
          onChanged={rebuild}
        />
      ))}

      {groups.table.length !== 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
            Table Attributes
          </Typography>
          {groups.table.map((enhanced) => (
            <Button
              key={enhanced.attributeInstance.uuid}
              variant="outlined"
              onClick={() => openTableDialog(enhanced)}
              sx={{ width: "100%", mb: 0.5 }}
            >
              {enhanced.attributeInstance.name}
            </Button>
          ))}
          <Divider sx={{ borderColor: "silver" }} />
        </Box>
      )}

      {groups.reference.length !== 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
            Reference Attributes
          </Typography>
          {groups.reference.map((enhanced) => (
            <Box key={enhanced.attributeInstance.uuid} sx={{ mb: 1 }}>
              <TextField
                InputProps={{ readOnly: true }}
                size="small"
                fullWidth
                label={enhanced.attributeInstance.name}
                value={enhanced.attributeInstance.role_instance_from?.name ?? ""}
              />
              {/* This button opens a dialog. All reference buttons share one dialog
                  view, so the context is passed when opening (see openReferenceDialog). */}
              <Button
                variant="outlined"
                onClick={() => openReferenceDialog(enhanced)}
                sx={{ width: "100%", wordBreak: "break-word", fontSize: ".7em" }}
              >
                {enhanced.attributeInstance.name}
              </Button>
            </Box>
          ))}
          <Divider sx={{ borderColor: "silver" }} />
        </Box>
      )}

      {/* The dialogs below are rendered once and driven by uiStore, replacing the old
          per-attribute inline <mdc-dialog view-model.ref="..."> elements. */}
      <ReferenceAttributeDialog onChanged={rebuild} />
      <TableAttributeDialog />
      <UploadFileDialog />
      <UploadGltfDialog firstLevel={firstLevel} />
      <UploadImageDialog firstLevel={firstLevel} />
    </Box>
  );
}

/**
 * The old "Static Attributes" block: read-only UUID + Class name. `nameLabel` is the
 * one addition — the scene-instance block labels the same field "Scene", which is what
 * tells the user at a glance that these are the model's attributes, not an element's.
 */
function StaticAttributes({
  uuid,
  name,
  nameLabel = "Class",
}: {
  uuid: string;
  name: string;
  nameLabel?: string;
}) {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
        Static Attributes
      </Typography>
      <TextField
        InputProps={{ readOnly: true }}
        size="small"
        label="UUID"
        value={uuid}
        sx={{ width: "100%" }}
      />
      <Divider sx={{ borderColor: "silver", my: 1 }} />
      <TextField
        InputProps={{ readOnly: true }}
        size="small"
        label={nameLabel}
        value={name ?? ""}
        sx={{ width: "100%" }}
      />
      <Divider sx={{ borderColor: "silver", my: 1 }} />
    </Box>
  );
}
