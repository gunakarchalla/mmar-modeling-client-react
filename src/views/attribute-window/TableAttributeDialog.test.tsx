// @vitest-environment jsdom
//
// P8 component tests for the table-attribute dialog: the grid is built from the
// attribute type's column structure (in `sequence` order), cell edits write through to
// the gds AttributeInstance, and "Create Row" appends one cell per column.
//
// NOTE on plan §9 P8 ("table add/remove rows"): the old client has NO remove-row — its
// dialog offers only Ok / Close / Create Row, and there is no delete method anywhere in
// dialog-table-attribute.ts. Only add is ported, and only add is tested.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AttributeInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: { selectedTab: 0, doSceneInstancePatch: false, current_class_instance: undefined as any } as any,
  instanceCreationHandler: { createAttributeInstance: vi.fn() },
  instanceUtility: { getTabContextSceneInstance: vi.fn(async () => ({ uuid_scene_type: "st-1" })) },
  metaUtility: { getMetaClass: vi.fn() },
}));

// P12: hybrid-algorithms-service imports the @/engine/global-definition LEAF directly,
// so it bypasses the `@/engine` barrel mock below and drags in a real WebGLRenderer at
// module scope — this whole file fails to load without this mock. (Same lesson as P9's
// persistency-handler, P10's shared-doc-service and P11's renderers.)
vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
}));
vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));

import TableAttributeDialog from "./TableAttributeDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

const TABLE_ATTRIBUTE_UUID = "attr-table";

function cellJson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "cell-1",
    uuid_attribute: "col-attr-1",
    value: "cell value",
    name: "Cell",
    table_row: 1,
    table_attributes: [],
    ...overrides,
  };
}

/** The meta attribute of the table, carrying its two columns. */
function tableMetaAttribute() {
  return {
    uuid: TABLE_ATTRIBUTE_UUID,
    name: "BPMN Table",
    attribute_type: {
      uuid: "at-table",
      has_table_attribute: [
        {
          sequence: 1,
          ui_component: "text",
          attribute: {
            uuid: "col-attr-1",
            name: "Column A",
            default_value: "A default",
            facets: "",
            attribute_type: { uuid: "at-string", has_table_attribute: [] },
          },
        },
        {
          sequence: 2,
          ui_component: "dropdown",
          attribute: {
            uuid: "col-attr-2",
            name: "Column B",
            default_value: "x",
            facets: "x|y",
            attribute_type: { uuid: "at-enum", has_table_attribute: [] },
          },
        },
      ],
    },
  };
}

/** Open the dialog on a table attribute holding `cells`. */
function openWith(cells: Record<string, unknown>[]): AttributeInstance {
  const attributeInstance = AttributeInstance.fromJS({
    uuid: "ai-table",
    uuid_attribute: TABLE_ATTRIBUTE_UUID,
    name: "BPMN Table",
    value: "",
    table_attributes: cells,
  }) as AttributeInstance;
  useUiStore.setState({
    dialogs: { ...useUiStore.getState().dialogs, tableAttribute: true },
    dialogPayloads: { tableAttribute: { attributeInstance, currentClassInstance: null, currentPortInstance: null } },
  });
  return attributeInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    doSceneInstancePatch: false,
    current_class_instance: { uuid: "ci-1", uuid_class: "class-1" },
  });
  mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [tableMetaAttribute()] });
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue({ uuid_scene_type: "st-1" });
  let created = 0;
  mocks.instanceCreationHandler.createAttributeInstance.mockImplementation(async (attribute: any, ...rest: any[]) => {
    created++;
    return AttributeInstance.fromJS({
      uuid: `new-cell-${created}`,
      uuid_attribute: attribute.uuid,
      name: attribute.name,
      value: rest[2],
      table_attributes: [],
    }) as AttributeInstance;
  });
  useUiStore.setState({
    dialogs: Object.fromEntries(
      Object.keys(useUiStore.getState().dialogs).map((n) => [n, false]),
    ) as never,
    dialogPayloads: {},
  });
});

describe("TableAttributeDialog", () => {
  it("renders nothing when no table attribute is in the payload", () => {
    const { container } = render(<TableAttributeDialog />);
    expect(container.firstChild).toBeNull();
  });

  it("builds the grid from the column structure, in sequence order", async () => {
    openWith([cellJson({ uuid: "cell-1", value: "row1-A" }), cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" })]);

    render(<TableAttributeDialog />);

    await waitFor(() => expect(screen.getByText("Column A")).toBeTruthy());
    expect(screen.getByText("Column B")).toBeTruthy();
    expect(screen.getByText("Table Attribute: BPMN Table")).toBeTruthy();
    // one row of two cells: a text field and a dropdown
    expect(screen.getByDisplayValue("row1-A")).toBeTruthy();
  });

  it("commits a cell edit to the AttributeInstance and publishes the vizrep channel", async () => {
    const attributeInstance = openWith([
      cellJson({ uuid: "cell-1", value: "row1-A" }),
      cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" }),
    ]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<TableAttributeDialog />);
    const input = await screen.findByDisplayValue("row1-A");
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.blur(input);

    await waitFor(() => expect(published).toHaveLength(1));
    sub.dispose();

    expect(attributeInstance.table_attributes[0].value).toBe("edited");
    expect(published[0].uuid).toBe("cell-1");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("Create Row appends one cell per column, with the meta default value and the next row number", async () => {
    const attributeInstance = openWith([
      cellJson({ uuid: "cell-1", value: "row1-A" }),
      cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" }),
    ]);

    render(<TableAttributeDialog />);
    await screen.findByText("Column A");
    fireEvent.click(screen.getByRole("button", { name: "Create Row" }));

    await waitFor(() => expect(attributeInstance.table_attributes).toHaveLength(4));
    expect(mocks.instanceCreationHandler.createAttributeInstance).toHaveBeenCalledTimes(2);

    // The new cells carry the column defaults and are tagged as row 2.
    const [cellA, cellB] = attributeInstance.table_attributes.slice(2);
    expect(cellA.value).toBe("A default");
    expect(cellB.value).toBe("x");
    expect(cellA.table_row).toBe(2);
    expect(cellB.table_row).toBe(2);

    // and the table now shows two rows
    await waitFor(() => expect(screen.getByDisplayValue("A default")).toBeTruthy());
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("gives a nested-table column an empty value instead of the default", async () => {
    const nested = tableMetaAttribute();
    // make column A itself a table -> the cell is created with "" (old createCell branch)
    nested.attribute_type.has_table_attribute[0].attribute.attribute_type.has_table_attribute = [
      { sequence: 1, ui_component: "text", attribute: { uuid: "deep", name: "Deep", default_value: "", facets: "", attribute_type: { uuid: "at-string", has_table_attribute: [] } } },
    ] as never;
    mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [nested] });
    const attributeInstance = openWith([
      cellJson({ uuid: "cell-1", value: "row1-A" }),
      cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" }),
    ]);

    render(<TableAttributeDialog />);
    await screen.findByText("Column A");
    fireEvent.click(screen.getByRole("button", { name: "Create Row" }));

    await waitFor(() => expect(attributeInstance.table_attributes).toHaveLength(4));
    expect(attributeInstance.table_attributes[2].value).toBe("");
  });
});
