import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { SceneInstance, SceneType } from "@gds";
import { engine, globalObject, globalClassObject, globalRelationclassObject, sceneInitiator } from "@/engine";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { snapshotService } from "@/resources/services/snapshot-service";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { backendService } from "@/resources/services/backend-service";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Port of `views/scenegroup/scenegroup.{ts,html}` (plan §10: ★ modeling-unique).
 * Builds the SceneType -> SceneInstance tree, opens a SceneInstance on double-click
 * (with snapshot rollback), and hosts the Create/Duplicate/Delete/Share buttons.
 *
 * WIDGET CHOICE (plan §4 left this to the P7 agent, recorded in state.json): nested
 * MUI `List` + `Collapse` (a 2-level tree), NOT @mui/x-tree-view — no new dependency
 * for a two-level structure. The old `mdc-tree-view` selected on click and used a
 * 500 ms double-click counter; here we use the native `onDoubleClick` and a plain
 * selection/expand state (the counter is unnecessary in React).
 *
 * COLLABORATION HOOKS -> // P10 stubs: the old ctor subscribed to
 * 'sharedSceneReconnected' / 'sceneAccessRevoked' and openScene called
 * `maybeAttachSharedSession`. Those are no-ops until P10 (shared-doc-service).
 *
 * The tree is loaded once the component mounts (which only happens after login).
 * The canonical arrays live on globalObject.sceneTypes / globalObject.sceneTree (the
 * old design — instance-utility.getAllSceneInstancesFromLocal reads sceneTree); the
 * component mirrors them into local state to render.
 */

type SceneTypeNode = SceneType & { children?: SceneInstance[] };

// Dedupe concurrent initTree() calls (StrictMode double-mount) — resolves to the
// same in-flight fetch; nulled on completion so a later login re-fetches.
let initInFlight: Promise<void> | null = null;

// P10: attaching a shared session when a scene has >=2 access entries is not ported
// yet (shared-doc-service). No-op until collaboration lands — scenes stay non-shared.
async function maybeAttachSharedSession(
  _sceneInstance: SceneInstance,
  _tabContext: { isShared: boolean },
): Promise<void> {
  // P10: sceneAccessListGET/attach/bindToSession + tabContext.isShared = true.
}

export default function SceneGroup() {
  const openDialog = useUiStore((s) => s.openDialog);
  const setLoading = useUiStore((s) => s.setLoading);

  const [tree, setTree] = useState<SceneTypeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ uuid: string; isType: boolean } | null>(null);
  const mountedRef = useRef(true);

  // Mirror the canonical globalObject.sceneTree into local state to trigger a render.
  const syncTreeFromGlobal = useCallback(() => {
    if (mountedRef.current) setTree([...(globalObject.sceneTree as SceneTypeNode[])]);
  }, []);

  const initTree = useCallback(async () => {
    if (initInFlight) return initInFlight;
    initInFlight = (async () => {
      setLoading(true);
      try {
        await metaUtility.getFiles();
        const sceneTypes = (await metaUtility.getAllSceneTypesFromDB()) as SceneTypeNode[];
        globalObject.sceneTypes = sceneTypes;

        for (const sceneType of sceneTypes) {
          const instances = await backendService.sceneInstancesAllGET(sceneType.uuid);
          if (!sceneType.children) sceneType.children = [];
          for (const sceneInstance of instances) {
            snapshotService.setSceneInstanceSnapshot(sceneInstance);
            sceneType.children.push(sceneInstance);
          }
        }
        globalObject.sceneTree = sceneTypes;
        syncTreeFromGlobal();
      } finally {
        setLoading(false);
        initInFlight = null;
      }
    })();
    return initInFlight;
  }, [setLoading, syncTreeFromGlobal]);

  // Port of updateTree(): fold imported scene instances + open tabs into the tree.
  const updateTree = useCallback(() => {
    const sceneTypes = globalObject.sceneTypes as SceneTypeNode[];
    const treeArr = globalObject.sceneTree as SceneTypeNode[];
    const importSceneInstances = globalObject.importSceneInstances ?? [];

    for (const sceneType of sceneTypes) {
      const addChild = (sceneInstance: SceneInstance | undefined) => {
        if (!sceneInstance || sceneInstance.uuid_scene_type !== sceneType.uuid) return;
        const index = treeArr.findIndex((item) => item.uuid === sceneType.uuid);
        if (index === -1) {
          logger.log(`SceneType with uuid ${sceneType.uuid} not found in tree`, "info");
          return;
        }
        if (!treeArr[index].children) treeArr[index].children = [];
        if (!treeArr[index].children!.some((c) => c.uuid === sceneInstance.uuid)) {
          treeArr[index].children!.push(sceneInstance);
        }
      };

      for (const imp of importSceneInstances) addChild(imp);
      for (const ctx of globalObject.tabContext) addChild(ctx.sceneInstance);
    }

    globalObject.importSceneInstances = [];
    globalObject.sceneTree = treeArr;
    syncTreeFromGlobal();
  }, [syncTreeFromGlobal]);

  // Init on mount (only reached post-login) + subscribe to the re-init/update channels.
  useEffect(() => {
    mountedRef.current = true;
    void initTree().catch((err) => logger.log(`SceneGroup init failed: ${err}`, "error"));

    const subUpdate = eventBus.subscribe("updateSceneGroup", () => updateTree());
    const subInit = eventBus.subscribe(
      "initSceneGroup",
      () => void initTree().catch((err) => logger.log(`SceneGroup re-init failed: ${err}`, "error")),
    );
    return () => {
      mountedRef.current = false;
      subUpdate.dispose();
      subInit.dispose();
    };
  }, [initTree, updateTree]);

  function toggleExpand(uuid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  async function openScene(node: SceneTypeNode | SceneInstance) {
    if (metaUtility.checkIfSceneType(node)) {
      // Opening a SceneType -> create-new-scene dialog preselected with this type.
      openDialog("createNewScene", { sceneType: node as SceneType });
    } else if (instanceUtility.checkIfSceneInstance(node)) {
      const sceneInstance = node as SceneInstance;
      // The engine must be initialised before we build a scene (guard the race where
      // a double-click lands before ThreeCanvas has finished engine.mount()).
      await engine.whenReady();
      await sceneInitiator.sceneInit();
      const tabContext = await instanceUtility.createTabContextSceneInstance(sceneInstance);

      // P10: shared-session attach (no-op until collaboration lands).
      await maybeAttachSharedSession(sceneInstance, tabContext);

      await persistencyHandler.loadPersistedModel(sceneInstance);
      globalClassObject.initClasses();
      globalRelationclassObject.initRelationClasses();

      // P12: hybridAlgorithmsService.checkHybridAlgorithms(null, sceneInstance.class_instances);
    }
  }

  async function openSceneWithRollback(node: SceneTypeNode | SceneInstance) {
    const openingSceneInstance = instanceUtility.checkIfSceneInstance(node);
    if (openingSceneInstance) snapshotService.createSceneOpenSnapshot();
    try {
      await openScene(node);
      snapshotService.clearSceneOpenSnapshot();
    } catch (error) {
      snapshotService.rollbackSceneOpen();
      throw error;
    }
  }

  async function handleDoubleClick(node: SceneTypeNode | SceneInstance) {
    try {
      await openSceneWithRollback(node);
    } catch {
      window.alert(
        "You don't have enough authorization to read comprehensive elements of this scene type.",
      );
    }
  }

  const helperFor = (uuid: string, isType: boolean) =>
    selected?.uuid === uuid ? (isType ? " DC for new" : " DC to open") : "";

  return (
    <Box>
      {/* Scene-instance action buttons (create P7; duplicate/delete P9; share P10). */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: 10, minWidth: 90 }} onClick={() => openDialog("createNewScene")}>
          Create new SceneInstance
        </Button>
        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: 10, minWidth: 90 }} onClick={() => openDialog("copyScene")}>
          Duplicate SceneInstance
        </Button>
        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: 10, minWidth: 90 }} onClick={() => openDialog("deleteScene")}>
          Delete SceneInstance
        </Button>
        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: 10, minWidth: 90 }} onClick={() => openDialog("shareScene")}>
          Share SceneInstance
        </Button>
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Scenes
      </Typography>

      <List dense disablePadding>
        {tree.map((sceneType) => {
          const isOpen = expanded.has(sceneType.uuid);
          const children = sceneType.children ?? [];
          return (
            <Fragment key={sceneType.uuid}>
              <ListItemButton
                selected={selected?.uuid === sceneType.uuid}
                onClick={() => setSelected({ uuid: sceneType.uuid, isType: true })}
                onDoubleClick={() => void handleDoubleClick(sceneType)}
                data-uuid={sceneType.uuid}
              >
                {children.length > 0 && (
                  <IconButton
                    size="small"
                    edge="start"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(sceneType.uuid);
                    }}
                    aria-label={isOpen ? "collapse" : "expand"}
                    sx={{ mr: 0.5 }}
                  >
                    {isOpen ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
                  </IconButton>
                )}
                <ListItemText
                  primary={
                    <span style={{ fontSize: "10pt" }}>
                      {sceneType.name}
                      <span style={{ fontSize: "7pt", color: "red", marginLeft: 4 }}>
                        {helperFor(sceneType.uuid, true)}
                      </span>
                    </span>
                  }
                />
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {children.map((sceneInstance) => (
                    <ListItemButton
                      key={sceneInstance.uuid}
                      sx={{ pl: 4 }}
                      selected={selected?.uuid === sceneInstance.uuid}
                      onClick={() => setSelected({ uuid: sceneInstance.uuid, isType: false })}
                      onDoubleClick={() => void handleDoubleClick(sceneInstance)}
                      data-uuid={sceneInstance.uuid}
                    >
                      <ListItemText
                        primary={
                          <span style={{ fontSize: "10pt" }}>
                            {sceneInstance.name}
                            <span style={{ fontSize: "7pt", color: "red", marginLeft: 4 }}>
                              {helperFor(sceneInstance.uuid, false)}
                            </span>
                          </span>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Fragment>
          );
        })}
      </List>
    </Box>
  );
}
