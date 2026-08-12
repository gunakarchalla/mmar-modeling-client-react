import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { Procedure } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { historyService } from "@/resources/services/history-service";
import { procedureUtility } from "@/resources/services/procedure-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * P12 port of `dialogs/dialog-algorithm/{ts,html}` — lists the procedures ("algorithms")
 * stored in the metamodel and runs the chosen one's code string.
 *
 * Two groups, exactly as the original: INDEPENDENT procedures (server-wide, always
 * listed) and procedures ASSIGNED to the open tab's SceneType (only when a tab is open).
 * Execution goes through `procedureUtility.execute(independentName, dependentName)`,
 * whose "" means "skip this group" — the data half has been live since P3, so this
 * phase only had to build the UI.
 *
 * The old dialog re-fetched on an `openAlgorithmDialog` event; here the uiStore
 * `algorithm` flag both opens the dialog and triggers the fetch (the P8/P9 dialog shape;
 * plan §5 drops the `openDialog*` channels in favour of uiStore).
 *
 * NOT PORTED — `sceneTypeName`: the old class assigns it in getProcedures(), but its
 * template never interpolates it (the heading is a static "Specific algorithms for this
 * SceneType"). Write-only dead state, dropped for the same reason P8 dropped the
 * attribute-window's four dead fields. Its only other reader would have been the
 * `chooseAlgorithm` ref div, which is empty and unused in the original too.
 */
export default function AlgorithmDialog() {
  const open = useUiStore((s) => s.dialogs.algorithm);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [procedureNames, setProcedureNames] = useState<string[]>([]);
  const [assignedProcedureNames, setAssignedProcedureNames] = useState<string[]>([]);
  const [independentAlgorithmChoice, setIndependentAlgorithmChoice] = useState<string>("");
  const [dependentAlgorithmChoice, setDependentAlgorithmChoice] = useState<string>("");

  const names = (procedures: Procedure[]) => procedures.map((procedure) => procedure.name);

  // Port of getProcedures() + getProcedureNames().
  const getProcedures = useCallback(async () => {
    const procedures = await procedureUtility.getGeneralProcedures();
    setProcedureNames(names(procedures));

    // Assigned procedures only exist for an open tab. The old dialog left the previous
    // tab's list on screen when none was open (its getProcedureNames() reset the arrays,
    // but only after this branch); clearing is the same intent without the staleness.
    if (globalObject.tabContext[globalObject.selectedTab] != undefined) {
      const assignedProcedures = await procedureUtility.getAssignedProcedures();
      setAssignedProcedureNames(names(assignedProcedures));
    } else {
      setAssignedProcedureNames([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndependentAlgorithmChoice("");
    setDependentAlgorithmChoice("");
    void getProcedures().catch((err) =>
      logger.log(`Could not load algorithms: ${describeError(err)}`, "error"),
    );
  }, [open, getProcedures]);

  async function executeIndependent() {
    await procedureUtility.execute(independentAlgorithmChoice, "");
    // A procedure is an arbitrary stored code string that may rewrite any part of the
    // scene, so the step carries no touched list and the whole scene gets diffed.
    historyService.record(`algorithm ${independentAlgorithmChoice}`);
  }

  async function executeDependent() {
    await procedureUtility.execute("", dependentAlgorithmChoice);
    historyService.record(`algorithm ${dependentAlgorithmChoice}`);
  }

  const run = (fn: () => Promise<void>) => () =>
    void fn().catch((err) => logger.log(`Algorithm failed: ${describeError(err)}`, "error"));

  return (
    <Dialog open={open} onClose={() => closeDialog("algorithm")} maxWidth="sm" fullWidth>
      <DialogTitle>Choose your algorithm:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="h6">Independent algorithms</Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="independent-algorithm-label">Select independent algorithm to run.</InputLabel>
            <Select
              labelId="independent-algorithm-label"
              label="Select independent algorithm to run."
              value={independentAlgorithmChoice}
              onChange={(e) => setIndependentAlgorithmChoice(e.target.value)}
            >
              {/* The old <mdc-list-item> with no value — lets the user clear the choice. */}
              <MenuItem value="">
                <em>&nbsp;</em>
              </MenuItem>
              {procedureNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={run(executeIndependent)} disabled={!independentAlgorithmChoice}>
            run
          </Button>

          <Divider />

          <Typography variant="h6">Specific algorithms for this SceneType</Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="dependent-algorithm-label">Select dependent algorithm to run.</InputLabel>
            <Select
              labelId="dependent-algorithm-label"
              label="Select dependent algorithm to run."
              value={dependentAlgorithmChoice}
              onChange={(e) => setDependentAlgorithmChoice(e.target.value)}
            >
              <MenuItem value="">
                <em>&nbsp;</em>
              </MenuItem>
              {assignedProcedureNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={run(executeDependent)} disabled={!dependentAlgorithmChoice}>
            run
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("algorithm")}>close</Button>
      </DialogActions>
    </Dialog>
  );
}
