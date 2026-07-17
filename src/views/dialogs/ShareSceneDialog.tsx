import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { jwtDecode } from "jwt-decode";
import type { SceneInstance, SceneType } from "@gds";
import { globalObject } from "@/engine";
import { backendService, type AccessEntry } from "@/resources/services/backend-service";
import { ApiError } from "@/resources/services/api";
import { logger } from "@/resources/services/logger";
import { useUiStore } from "@/resources/store/uiStore";
import type { AccessLevel } from "@/resources/collaboration/shared-doc-service";

/**
 * P10 port of `dialogs/share-scene-instance/{ts,html,css}` (147 lines + css). Manages
 * the access list of a SceneInstance through the `sceneAccess*` endpoints; a scene
 * with >= 2 entries is what makes SceneGroup attach a shared yjs session on open.
 * Opened from SceneGroup's "Share SceneInstance" button via uiStore.
 *
 * The old view took the tree through a `@bindable tree` prop; here the scene list is
 * flattened out of `globalObject.sceneTree` when the dialog opens, matching what P9's
 * Copy/Delete dialogs do (and dropping the bindable, which had exactly one caller).
 *
 * The .css is gone: the three class rules (`user-row`, `access-pill--<level>`,
 * `share-error`) become `sx` props (plan §10: "port stray rules into sx/styled").
 */

type SceneTypeNode = SceneType & { children?: SceneInstance[] };

interface JwtPayload {
  uuid: string;
  username: string;
  exp?: number;
}

/** Colours of the old `.access-pill--read | --edit | --delete` rules. */
const PILL_COLOURS: Record<string, { bg: string; fg: string }> = {
  read: { bg: "#e3f2fd", fg: "#1565c0" },
  edit: { bg: "#e8f5e9", fg: "#2e7d32" },
  delete: { bg: "#fff3e0", fg: "#e65100" },
};

/** Port of `levelLabel(entry)` — the flags collapse to the highest level granted. */
function levelLabel(entry: AccessEntry): string {
  if (entry.delete_access) return "delete";
  if (entry.edit_access) return "edit";
  return "read";
}

function AccessPill({ level }: { level: string }) {
  const colours = PILL_COLOURS[level] ?? { bg: "#e0e0e0", fg: "#333" };
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 0.9,
        py: "1px",
        borderRadius: "10px",
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        bgcolor: colours.bg,
        color: colours.fg,
      }}
    >
      {level}
    </Box>
  );
}

export default function ShareSceneDialog() {
  const open = useUiStore((s) => s.dialogs.shareScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstances, setSceneInstances] = useState<SceneInstance[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");
  const [existingAccess, setExistingAccess] = useState<AccessEntry[]>([]);
  const [levelChoice, setLevelChoice] = useState<AccessLevel>("read");
  const [usernameInput, setUsernameInput] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentUserUuid, setCurrentUserUuid] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedSceneInstance = sceneInstances.find((si) => si.uuid === selectedUuid) ?? null;

  // Port of attached(): decode our own uuid (so we cannot revoke our own access) and
  // build the scene list. Re-runs per open, which is what the old dialog's attached()
  // + treeChanged() achieved between openings.
  useEffect(() => {
    if (!open) return;
    try {
      const token = globalObject.accessToken;
      if (token) setCurrentUserUuid(jwtDecode<JwtPayload>(token).uuid);
    } catch {
      // ignore decode errors
    }
    const tree = (globalObject.sceneTree ?? []) as SceneTypeNode[];
    setSceneInstances(tree.flatMap((sceneType) => sceneType.children ?? []));
    setSelectedUuid("");
    setExistingAccess([]);
    setCanManage(false);
    setErrorMsg("");
    setUsernameInput("");
  }, [open]);

  const loadAccessList = useCallback(async (sceneInstanceUuid: string) => {
    setLoading(true);
    try {
      const [list, me] = await Promise.all([
        backendService.sceneAccessListGET(sceneInstanceUuid),
        backendService.sceneAccessMeGET(sceneInstanceUuid),
      ]);
      setExistingAccess(list ?? []);
      // Only a 'delete'-level holder may manage the list (the old `canManage`).
      setCanManage(me?.level === "delete");
    } catch {
      setExistingAccess([]);
      setCanManage(false);
    }
    setLoading(false);
  }, []);

  // Port of onSceneInstanceChange(): reset the form, then load that scene's list.
  function onSceneInstanceChange(event: SelectChangeEvent) {
    const uuid = event.target.value;
    setSelectedUuid(uuid);
    setErrorMsg("");
    setUsernameInput("");
    setExistingAccess([]);
    setCanManage(false);
    if (!uuid) return;
    void loadAccessList(uuid);
  }

  // Port of add(). The status branches are why backend-service throws ApiError for
  // these endpoints rather than swallowing (see api.ts → ApiError).
  async function add() {
    if (!usernameInput.trim() || !selectedSceneInstance) {
      setErrorMsg("Username is required");
      return;
    }
    setErrorMsg("");
    try {
      const user = await backendService.userByUsernameGET(usernameInput.trim());
      const entry = await backendService.sceneAccessPOST(selectedSceneInstance.uuid, {
        uuid_user: user.uuid,
        access: levelChoice,
      });
      setExistingAccess((prev) => {
        const index = prev.findIndex((a) => a.uuid_user === user.uuid);
        if (index >= 0) {
          const next = [...prev];
          next[index] = entry;
          return next;
        }
        return [...prev, entry];
      });
      setUsernameInput("");
      logger.log(
        `Granted ${levelChoice} access to ${user.username} on scene ${selectedSceneInstance.uuid}`,
        "info",
      );
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 404) setErrorMsg("User not found");
      else if (status === 409) setErrorMsg("Cannot remove the last delete owner");
      else setErrorMsg("An error occurred while granting access");
    }
  }

  // Port of removeAccess(entry).
  async function removeAccess(entry: AccessEntry) {
    if (!selectedSceneInstance) return;
    try {
      await backendService.sceneAccessDELETE(selectedSceneInstance.uuid, entry.uuid_user);
      setExistingAccess((prev) => prev.filter((a) => a.uuid_user !== entry.uuid_user));
      logger.log(`Revoked access for ${entry.username} on scene ${selectedSceneInstance.uuid}`, "info");
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 409) setErrorMsg("Cannot remove the last delete owner");
      else setErrorMsg("An error occurred while revoking access");
    }
  }

  // Port of cancel(): clears the form, then closes (the old button also carried
  // data-mdc-dialog-action="cancel", which is what actually dismissed the dialog).
  function cancel() {
    setUsernameInput("");
    setErrorMsg("");
    closeDialog("shareScene");
  }

  return (
    <Dialog open={open} onClose={cancel} fullWidth maxWidth="sm">
      <DialogTitle>Share Scene Instance</DialogTitle>
      <DialogContent>
        <FormControl fullWidth size="small" sx={{ mt: 1 }}>
          <InputLabel id="share-scene-select-label">Select Scene Instance</InputLabel>
          <Select
            labelId="share-scene-select-label"
            label="Select Scene Instance"
            value={selectedUuid}
            onChange={onSceneInstanceChange}
          >
            {sceneInstances.map((si) => (
              <MenuItem key={si.uuid} value={si.uuid}>
                {si.name} | {si.uuid}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedSceneInstance && (
          <Box sx={{ mt: 2 }}>
            {loading && (
              <Typography sx={{ color: "grey.600", fontSize: 12 }}>Loading access list…</Typography>
            )}

            {!loading && (
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: "bold", mb: 0.5 }}>
                  Users with access:
                </Typography>
                {existingAccess.length === 0 && (
                  <Typography sx={{ color: "grey.600", fontSize: 12, mb: 1 }}>
                    No access entries found or you don&apos;t have permission to view them.
                  </Typography>
                )}
                {existingAccess.map((a) => (
                  <Box
                    key={a.uuid_user}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      py: 0.5,
                      borderBottom: "1px solid #eee",
                      fontSize: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box component="span" sx={{ fontWeight: 500, flex: 1, minWidth: 80 }}>
                      {a.username}
                    </Box>
                    {a.displayname && a.displayname !== a.username && (
                      <Box component="span" sx={{ color: "#666", fontSize: 11 }}>
                        ({a.displayname})
                      </Box>
                    )}
                    <AccessPill level={levelLabel(a)} />
                    {canManage && a.uuid_user !== currentUserUuid && (
                      <IconButton
                        size="small"
                        aria-label={`Revoke access for ${a.username}`}
                        sx={{ color: "#c00", p: 0.25 }}
                        onClick={() => void removeAccess(a)}
                      >
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {canManage && !loading && (
              <Box>
                <Divider sx={{ my: 1.5 }} />
                <Typography sx={{ fontSize: 11, fontWeight: "bold", mb: 0.5 }}>Add user:</Typography>
                <TextField
                  label="Username"
                  size="small"
                  fullWidth
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="share-level-select-label">Access level</InputLabel>
                  <Select
                    labelId="share-level-select-label"
                    label="Access level"
                    value={levelChoice}
                    onChange={(e) => setLevelChoice(e.target.value as AccessLevel)}
                  >
                    <MenuItem value="read">Read</MenuItem>
                    <MenuItem value="edit">Edit</MenuItem>
                    <MenuItem value="delete">Delete</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}

            {errorMsg && (
              <Typography sx={{ color: "#c00", fontSize: 12, mt: 0.5 }}>{errorMsg}</Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        {canManage && selectedSceneInstance && !loading && (
          <Button variant="contained" onClick={() => void add()}>
            Add user
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
