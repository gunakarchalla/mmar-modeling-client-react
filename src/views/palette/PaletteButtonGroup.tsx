import { useCallback, useEffect, useState } from "react";
import { Box, Divider, ImageList, ImageListItem, Paper, Tooltip, Typography } from "@mui/material";
import { engine, globalObject, globalClassObject, globalStateObject } from "@/engine";
import { eventBus } from "@/resources/services/event-bus";
import { useTabsStore } from "@/resources/store/tabsStore";

/**
 * Shared presentational port of `class-buttongroup` + `relationclass-buttongroup`
 * (plan §10 -> `views/palette/*`). The old views kept an `openTab` bindable, an
 * `mdc-expandable` "Classes"/"Relationclasses" caption, and an `mdc-image-list` of
 * `mdc-card`s whose `src` was the icon resolved by `globalClassObject.getIcon`.
 *
 * `metaObjects` are the classes or relationclasses of the active tab's sceneType.
 * `stateToEnter` is the drawing-mode state the old `onButtonClicked` set (2 for
 * classes, 3 for relationclasses). Icons are resolved asynchronously and refreshed
 * on `tabChanged` (the old subscription) and whenever the selected tab changes.
 */
interface PaletteItem {
  uuid: string;
  name: string;
  icon: string;
}

interface Props {
  title: string;
  /** Reads the meta objects for the active tab (classes vs relationclasses). */
  getMetaObjects: () => { uuid: string; name: string; geometry: unknown }[] | undefined;
  /** Sets the selected meta object on the matching global object. */
  onSelect: (uuid: string) => void;
  /** DrawingMode state to enter after selection (2 = class, 3 = relationclass). */
  stateToEnter: number;
}

export default function PaletteButtonGroup({ title, getMetaObjects, onSelect, stateToEnter }: Props) {
  const selectedTab = useTabsStore((s) => s.selectedTab);
  const [items, setItems] = useState<PaletteItem[]>([]);

  const loadIcons = useCallback(async () => {
    if (globalObject.selectedTab < 0) {
      setItems([]);
      return;
    }
    const metaObjects = getMetaObjects();
    if (!metaObjects) {
      setItems([]);
      return;
    }
    const resolved = await Promise.all(
      metaObjects.map(async (mc) => ({
        uuid: mc.uuid,
        name: mc.name,
        icon: await globalClassObject.getIcon(String(mc.geometry ?? "")),
      })),
    );
    setItems(resolved);
  }, [getMetaObjects]);

  // Load on mount + tab change, and re-subscribe to the old `tabChanged` channel
  // (buttongroups refreshed their icons there). Non-async wrapper per plan §3.1.
  useEffect(() => {
    void loadIcons();
    const sub = eventBus.subscribe("tabChanged", () => void loadIcons());
    return () => sub.dispose();
  }, [loadIcons, selectedTab]);

  function handleClick(uuid: string) {
    onSelect(uuid);
    // Guard setState: onStateChange touches transformControls/orbitControls which
    // only exist after engine.mount() (plan §9 P5/P6 rule).
    if (engine.isInitialized) {
      globalStateObject.setState(stateToEnter);
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Divider sx={{ my: 0.5 }} />
      <ImageList cols={3} gap={4} sx={{ maxHeight: "40vh", overflowY: "auto", m: 0 }}>
        {items.map((item) => (
          <ImageListItem key={item.uuid}>
            <Tooltip title={item.name} placement="top">
              <Paper
                variant="outlined"
                onClick={() => handleClick(item.uuid)}
                sx={{
                  cursor: "pointer",
                  p: 0.5,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  "&:hover": { borderColor: "primary.main" },
                }}
                data-uuid={item.uuid}
                data-name={item.name}
              >
                {item.icon ? (
                  <Box
                    component="img"
                    src={item.icon}
                    alt={item.name}
                    sx={{ width: "100%", height: 40, objectFit: "contain" }}
                  />
                ) : (
                  <Box sx={{ width: "100%", height: 40 }} />
                )}
                <Typography variant="caption" sx={{ fontSize: "0.7em", wordBreak: "break-word" }}>
                  {item.name}
                </Typography>
              </Paper>
            </Tooltip>
          </ImageListItem>
        ))}
      </ImageList>
    </Box>
  );
}
