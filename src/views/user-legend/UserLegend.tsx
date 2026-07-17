import { Box, Tooltip } from "@mui/material";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { useCollabStore } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";

/**
 * P11 port of `views/user-legend/user-legend.{ts,html,css}` (64 + 15 + 48 lines).
 *
 * Two pieces of shared presence for the ACTIVE tab: the disconnect banner, and one
 * coloured chip per connected collaborator (initials, tooltip = username, the local
 * user's chip outlined).
 *
 * FULLY REACTIVE, NO POLLING (plan §9 P11). The old component read everything through
 * getters on `sharedDocService` + `globalObject.selectedTab` and polled awareness every
 * 500 ms, because Aurelia dirty-checked the getters and awareness callbacks fired
 * outside its change-detection cycle. Here both triggers are named explicitly:
 *   - `collabStore.tabs`      -> session attach/detach, status/banner changes, and the
 *                                awareness-driven user list (shared-doc-service pushes
 *                                it from awareness 'change' events).
 *   - `tabsStore.selectedTab` -> the user switching tabs.
 * Missing the second one is exactly the stale-render bug P10 hit in AutoSave: any "is
 * the ACTIVE tab X" question needs the tab-selection trigger as well as X's own.
 *
 * `isVisible` (old getter: `forTab(selectedTab) !== null`) becomes `selectedTab in
 * collabStore.tabs` — a tab with no collab entry is not shared, which is the store's
 * documented shape (P10).
 *
 * The old .css is not ported as a file: its four rules become `sx` props (plan §10 —
 * port stray rules into sx/styled), matching what P10 did for ShareSceneDialog.
 */
export default function UserLegend() {
  const selectedTab = useTabsStore((s) => s.selectedTab);
  const collabTabs = useCollabStore((s) => s.tabs);

  const tab = selectedTab >= 0 ? collabTabs[selectedTab] : undefined;
  const banner = tab?.banner ?? null;
  const users = tab?.users ?? [];

  // Not shared and nothing to report -> render nothing, as the old template's two
  // `if.bind` gates did.
  if (!tab && !banner) return null;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      {banner && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: "2px",
            backgroundColor: "#b00020",
            color: "#fff",
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          <SyncProblemIcon sx={{ fontSize: 16 }} />
          <Box component="span" sx={{ lineHeight: 1.2 }}>
            {banner}
          </Box>
        </Box>
      )}

      {tab && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: "4px", px: "4px" }}>
          {users.map((u) => (
            <Tooltip key={u.clientId} title={`${u.username}${u.isLocal ? " (you)" : ""}`}>
              <Box
                component="span"
                aria-label={`${u.username}${u.isLocal ? " (you)" : ""}`}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: u.color,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "default",
                  userSelect: "none",
                  flexShrink: 0,
                  ...(u.isLocal ? { outline: "2px solid #fff", outlineOffset: "1px" } : {}),
                }}
              >
                {u.initials}
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}
    </Box>
  );
}
