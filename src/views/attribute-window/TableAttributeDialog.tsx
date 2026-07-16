import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { Attribute, AttributeInstance, ClassInstance, PortInstance } from "@gds";
// ColumnStructure is NOT re-exported from the gds barrel — deep-import it, exactly as
// the old dialog-table-attribute.ts did.
import type { ColumnStructure } from "@gds/models/meta/Metamodel_columns.structure";
import { globalObject, instanceCreationHandler } from "@/engine";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { numerise, stringifyNumber } from "@/resources/services/format";
import { useUiStore } from "@/resources/store/uiStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID } from "@/constants";

/**
 * P8 port of `dialogs/dialog-table-attribute/{ts,html}` (275 lines). Renders an
 * attribute whose type declares `has_table_attribute` columns as an editable grid,
 * with "Create Row" appending a cell per column.
 *
 * RECURSION: a column with `ui_component: 'button'` holds a nested table attribute and
 * opens ANOTHER table dialog (the old `nestedDialogs[i][j]` refs). The uiStore can only
 * express one open `tableAttribute` dialog, so only the OUTERMOST dialog is uiStore-
 * driven; nested levels are local state on the recursive view component below. The
 * demo metamodel really uses this — Robotic system → Joint has button columns.
 */
interface TablePayload {
  attributeInstance: AttributeInstance;
  currentClassInstance?: ClassInstance | null;
  currentPortInstance?: PortInstance | null;
}

/** uiStore host for the outermost dialog. */
export default function TableAttributeDialog() {
  const open = useUiStore((s) => s.dialogs.tableAttribute);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.tableAttribute) as TablePayload | undefined;

  if (!payload?.attributeInstance) return null;

  return (
    <TableAttributeDialogView
      open={open}
      attributeInstance={payload.attributeInstance}
      currentClassInstance={payload.currentClassInstance ?? null}
      currentPortInstance={payload.currentPortInstance ?? null}
      onClose={() => closeDialog("tableAttribute")}
    />
  );
}

interface TableAttributeDialogViewProps {
  open: boolean;
  attributeInstance: AttributeInstance;
  /** Old `@bindable attribute` — set for nested dialogs (`columns[j].attribute`). */
  attribute?: Attribute;
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  onClose: () => void;
}

export function TableAttributeDialogView({
  open,
  attributeInstance,
  attribute,
  currentClassInstance,
  currentPortInstance,
  onClose,
}: TableAttributeDialogViewProps) {
  const [columns, setColumns] = useState<ColumnStructure[]>([]);
  const [rows, setRows] = useState<AttributeInstance[][]>([]);
  const [facetsAll, setFacetsAll] = useState<string[][]>([]);
  const [currentAttribute, setCurrentAttribute] = useState<Attribute | null>(null);
  const [nestedCell, setNestedCell] = useState<{ row: number; col: number } | null>(null);
  const bump = useSelectionStore((s) => s.bump);

  // setMetaInformation() + setUpTable(), collapsed into one loader (the old attached()
  // called reset() + load(), and load() called both in sequence).
  const load = useCallback(async () => {
    const attributeUUID = attributeInstance.uuid_attribute;
    const currentClass = globalObject.current_class_instance
      ? await metaUtility.getMetaClass(globalObject.current_class_instance.uuid_class)
      : undefined;
    const metaAttribute =
      attribute ?? currentClass?.attributes.find((candidate) => candidate.uuid === attributeUUID);
    setCurrentAttribute(metaAttribute ?? null);

    //get the table cells
    const tableAttributes = attributeInstance.table_attributes ?? [];
    //if there are no table attributes, there is no table
    if (!tableAttributes.length || !metaAttribute) {
      setColumns([]);
      setRows([]);
      setFacetsAll([]);
      return;
    }

    const hasTableAttribute = metaAttribute.attribute_type.has_table_attribute ?? [];

    //for each entry in column structure, in sequence order
    const nextColumns: ColumnStructure[] = [];
    for (let i = 0; i < hasTableAttribute.length; i++) {
      const rightIndexAttribute = hasTableAttribute.find((column) => column.sequence === i + 1);
      if (rightIndexAttribute) nextColumns.push(rightIndexAttribute);
    }

    const nextFacets: string[][] = nextColumns.map((column) => {
      const uiComponent = (column.ui_component ?? "").toLowerCase();
      if ((uiComponent === "dropdown" || uiComponent === "slider") && column.attribute) {
        return column.attribute.facets.split("|");
      }
      return [];
    });

    // chunk the flat cell list into rows of columns.length
    const nextRows: AttributeInstance[][] = [];
    if (nextColumns.length > 0) {
      for (let i = 0; i < tableAttributes.length; i += nextColumns.length) {
        const row: AttributeInstance[] = [];
        for (let j = 0; j < nextColumns.length; j++) {
          row.push(tableAttributes[i + j]);
        }
        nextRows.push(row);
      }
    }

    setColumns(nextColumns);
    setFacetsAll(nextFacets);
    setRows(nextRows);
  }, [attributeInstance, attribute]);

  useEffect(() => {
    if (!open) return;
    void load().catch((err) => logger.log("table attribute load failed: " + describeError(err), "error"));
  }, [open, load]);

  // dialog-table-attribute.ts:228 — fieldChange
  async function fieldChange(cell: AttributeInstance) {
    //update attribute value
    cell.value = cell.value.toString();

    eventBus.publish("checkForVizRepUpdateByAttributeInstance", cell);

    // if scenetype is robotic system, check if there are changes that require a hybrid
    // algorithm to run
    const sceneInstance = await instanceUtility.getTabContextSceneInstance();
    if (sceneInstance?.uuid_scene_type == ROBOTIC_SYSTEM_SCENETYPE_UUID) {
      // P12: hybridAlgorithmsService.checkHybridAlgorithms(cell, [currentClassInstance],
      // null, currentClass, currentAttribute);
    } else if (currentClassInstance) {
      // P12: hybridAlgorithmsService.checkHybridAlgorithms(null, [currentClassInstance]);
    } else if (currentPortInstance) {
      // P12: hybridAlgorithmsService.checkHybridAlgorithms(null, null, [currentPortInstance]);
    }

    //patch attribute instance
    //---------------------------------
    // !!! endpoints with instances/attributesInstances are not working
    // instead set the globalObjectInstance.doSceneInstancePatch to true
    //---------------------------------
    globalObject.doSceneInstancePatch = true;

    // The old client published nothing here (its `tableAttributeChanged` publish is
    // commented out). The window still has to notice the in-place edit, so bump the
    // P5 selection store — the plan's `revision` re-render trigger (§3.1/§3.2).
    bump();
  }

  function commitCell(cell: AttributeInstance, next: string) {
    cell.value = next;
    void fieldChange(cell).catch((err) =>
      logger.log("table attribute change failed: " + describeError(err), "error"),
    );
  }

  // dialog-table-attribute.ts:166 — createRow / createCell
  async function createRow() {
    if (!currentAttribute) return;
    const hasTableAttribute = currentAttribute.attribute_type.has_table_attribute ?? [];
    //Count the number of rows in the table
    const numRows = rows.length;

    //Create a new row: a cell per column
    for (const column of hasTableAttribute) {
      await createCell(numRows + 1, column.sequence, hasTableAttribute);
    }

    //Reload the table
    await load();
    globalObject.doSceneInstancePatch = true;
    bump();
  }

  async function createCell(row: number, columnIndex: number, hasTableAttribute: ColumnStructure[]) {
    // The column where the cell is created
    const parentAttributeColumn = hasTableAttribute.find((column) => column.sequence === columnIndex);
    if (!parentAttributeColumn || !currentAttribute) return;

    const metaAttribute = parentAttributeColumn.attribute;
    // Create a new instance of the attribute that is in the column. A column whose own
    // attribute is a table gets an empty value; otherwise the meta default.
    const isNestedTable = metaAttribute.attribute_type.has_table_attribute.length > 0;
    const newAttributeInstance = await instanceCreationHandler.createAttributeInstance(
      parentAttributeColumn.attribute,
      null as unknown as string,
      null as unknown as string,
      isNestedTable ? "" : (parentAttributeColumn.attribute.default_value ?? "not defined"),
      undefined,
      undefined,
      undefined,
      undefined,
      currentAttribute.uuid,
      undefined,
    );

    // Set the row of the new attribute instance
    newAttributeInstance.table_row = row;

    // Add the new attribute instance to the list of attribute instances in the current
    // attribute
    attributeInstance.table_attributes.push(newAttributeInstance);
  }

  const nestedAttributeInstance =
    nestedCell !== null ? rows[nestedCell.row]?.[nestedCell.col] : undefined;
  const nestedAttribute = nestedCell !== null ? columns[nestedCell.col]?.attribute : undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Table Attribute: {attributeInstance.name}</DialogTitle>
      <DialogContent>
        <Table sx={{ border: "1.5px solid", width: "100%", tableLayout: "fixed" }} aria-describedby="Table">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.attribute?.uuid ?? column.sequence}
                  sx={{ border: "0.75px solid", width: 120, textAlign: "center" }}
                >
                  {column.attribute?.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row[0]?.uuid ?? i}>
                {row.map((cell, j) => {
                  const uiComponent = (columns[j]?.ui_component ?? "").toLowerCase();
                  return (
                    <TableCell
                      key={cell?.uuid ?? `${i}-${j}`}
                      sx={{ border: "0.75px solid", width: 120, textAlign: "center" }}
                    >
                      {cell && (
                        <TableAttributeCell
                          cell={cell}
                          uiComponent={uiComponent}
                          facets={facetsAll[j] ?? []}
                          onCommit={(next) => commitCell(cell, next)}
                          onOpenNested={() => setNestedCell({ row: i, col: j })}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Ok</Button>
        <Button onClick={onClose}>Close</Button>
        <Button
          onClick={() =>
            void createRow().catch((err) => logger.log("create row failed: " + describeError(err), "error"))
          }
        >
          Create Row
        </Button>
      </DialogActions>

      {/* Nested table dialog (a column with ui_component 'button'). */}
      {nestedAttributeInstance && (
        <TableAttributeDialogView
          open={nestedCell !== null}
          attributeInstance={nestedAttributeInstance}
          attribute={nestedAttribute}
          currentClassInstance={currentClassInstance}
          currentPortInstance={currentPortInstance}
          onClose={() => setNestedCell(null)}
        />
      )}
    </Dialog>
  );
}

/** One cell: text / slider / dropdown / nested-table button (the old td branches). */
function TableAttributeCell({
  cell,
  uiComponent,
  facets,
  onCommit,
  onOpenNested,
}: {
  cell: AttributeInstance;
  uiComponent: string;
  facets: string[];
  onCommit: (next: string) => void;
  onOpenNested: () => void;
}) {
  const [value, setValue] = useState<string>(cell.value ?? "");

  useEffect(() => {
    setValue(cell.value ?? "");
  }, [cell, cell.value]);

  if (uiComponent === "text") {
    return (
      <TextField
        size="small"
        value={value}
        onChange={(e) => {
          cell.value = e.target.value;
          setValue(e.target.value);
        }}
        onBlur={() => onCommit(value)}
        inputProps={{ "aria-label": cell.name }}
      />
    );
  }

  if (uiComponent === "slider") {
    return (
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", width: "100%" }}>
        <Typography component="span" sx={{ mr: "2.2rem", whiteSpace: "nowrap", width: 25 }}>
          Val:{numerise(value, undefined, Number(facets[0]))}
        </Typography>
        <Slider
          sx={{ width: "100%" }}
          min={Number(facets[0])}
          max={Number(facets[1])}
          step={Number(facets[2]) || 1}
          value={numerise(value, undefined, Number(facets[0]))}
          onChange={(_e, next) => {
            const asString = stringifyNumber(next as number);
            cell.value = asString;
            setValue(asString);
          }}
          onChangeCommitted={(_e, next) => onCommit(stringifyNumber(next as number))}
          aria-label={cell.name}
        />
      </Box>
    );
  }

  if (uiComponent === "dropdown") {
    return (
      <FormControl fullWidth required size="small">
        <InputLabel id={`cell-${cell.uuid}`}>{cell.name}</InputLabel>
        <Select
          labelId={`cell-${cell.uuid}`}
          label={cell.name}
          value={value}
          onChange={(e) => onCommit(e.target.value)}
        >
          {facets.map((facet) => (
            <MenuItem key={facet} value={facet}>
              {facet}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  if (uiComponent === "button") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Button variant="outlined" sx={{ width: "100%" }} onClick={onOpenNested}>
          {cell.name}
        </Button>
      </Box>
    );
  }

  return null;
}
