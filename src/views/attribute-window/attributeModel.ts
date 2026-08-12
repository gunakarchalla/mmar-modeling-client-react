import type {
  Attribute,
  AttributeInstance,
  ClassInstance,
  PortInstance,
  RelationclassInstance,
} from "@gds";
import { globalObject, globalSelectedObject } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { historyService } from "@/resources/services/history-service";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { applyLocalChangeToYDoc } from "@/resources/collaboration/y-mapping";
import { FILE_ATTRIBUTE_TYPE_UUID } from "@/constants";

/**
 * The data half of the old `views/attribute-window/attribute-window.ts` — its
 * `updater()` / `reset()` / `getAttributeInstancesOfFileType()` methods, extracted
 * into a plain async function so it is unit-testable without rendering (the same
 * split P6 used for `views/layout/tabActions.ts`). `AttributeWindow.tsx` owns the
 * React state and the event wiring; this module owns the "which attributes, in what
 * order, in which group" logic.
 *
 * DEAD STATE NOT PORTED (verified by grepping the old .ts AND .html — none of these
 * is ever read, neither by the template nor by any other file in the old client):
 *   - `oldAttributeValues`: written in updater(), cleared in reset(), never read.
 *     Plan §9 P8 calls it "`oldAttributeValues` diffing", but no diffing exists.
 *   - `attributeTypesFor{NoTable,Table,Reference}AttributeInstances`: three arrays
 *     pushed in lockstep with the groups below and never read.
 *   - `visible`: set true whenever a plain/table attribute exists, never read (the
 *     template gates on the group lengths instead).
 * Reproducing them as React state would cause re-render churn for no behaviour.
 * See state.json → discoveries (P8).
 */

/** One row of the old `enhancedAttributeInstanceArray`. */
export interface EnhancedAttributeInstance {
  attributeInstance: AttributeInstance;
  sequence: number;
  uiType: string;
  metaAttribute: Attribute;
  facets: string[];
}

/** Everything `AttributeWindow` renders for one selected instance. */
export interface AttributeGroups {
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  currentRelationclassInstance: RelationclassInstance | null;
  /** `attributeInstancesNoTable` — plain fields (text / dropdown / slider / upload). */
  plain: EnhancedAttributeInstance[];
  /** `attributeInstanceTable` — attributes that own table_attributes. */
  table: EnhancedAttributeInstance[];
  /** `attributeInstancesReferenceAttribute` — attributes whose type carries a Role. */
  reference: EnhancedAttributeInstance[];
  /** `attributeInstancesUuidsOfFileType` — uuids of the attribute instances of type File. */
  fileTypeUuids: string[];
}

/** The `reset()` state: nothing selected, nothing to show. */
export function emptyAttributeGroups(): AttributeGroups {
  return {
    currentClassInstance: null,
    currentPortInstance: null,
    currentRelationclassInstance: null,
    plain: [],
    table: [],
    reference: [],
    fileTypeUuids: [],
  };
}

/**
 * Port of `attribute-window.getAttributeInstancesOfFileType()`: the uuids of those
 * attribute instances whose META attribute is of the File attribute type.
 */
async function getFileTypeAttributeInstanceUuids(
  attributeInstances: AttributeInstance[],
): Promise<string[]> {
  const uuids: string[] = [];
  for (const attributeInstance of attributeInstances) {
    // looping through all attribute instances and checking if the attribute type is
    // file through uuid of File Attribute Type
    const metaAttribute = await metaUtility.getMetaAttribute(attributeInstance.uuid_attribute);
    if (metaAttribute?.attribute_type.uuid == FILE_ATTRIBUTE_TYPE_UUID) {
      // if the attribute instance is not already in the array, push it
      if (!uuids.includes(attributeInstance.uuid)) {
        uuids.push(attributeInstance.uuid);
      }
    }
  }
  return uuids;
}

/**
 * Port of `attribute-window.updater()`. Resolves the selected THREE object back to
 * its class / port / relationclass instance, enriches every attribute instance with
 * its meta attribute (sequence, ui_component, facets), sorts by sequence and splits
 * the result into the three groups the window renders.
 *
 * Returns the `reset()` state when nothing is selected.
 */
export async function buildAttributeGroups(): Promise<AttributeGroups> {
  const groups = emptyAttributeGroups();

  //if there is a selected object
  const selectedObject = globalSelectedObject.getObject();
  if (!selectedObject) return groups;

  //get classInstance and its AttributeInstances
  const sceneInstance = await instanceUtility.getTabContextSceneInstance();
  if (!sceneInstance) return groups;

  groups.currentClassInstance =
    sceneInstance.class_instances.find((class_instance) => class_instance.uuid == selectedObject.uuid) ?? null;
  const portInstances = await instanceUtility.getAllPortInstancesOfTabContext();
  groups.currentPortInstance =
    portInstances.find((port_instance) => port_instance.uuid == selectedObject.uuid) ?? null;
  groups.currentRelationclassInstance =
    sceneInstance.relationclasses_instances.find(
      (relationclass_instance) => relationclass_instance.uuid == selectedObject.uuid,
    ) ?? null;

  let attributeInstances: AttributeInstance[] = [];
  //if there is a classInstance
  if (groups.currentClassInstance) {
    attributeInstances = groups.currentClassInstance.attribute_instance;
  }
  //if there is a portInstance
  else if (groups.currentPortInstance) {
    attributeInstances = groups.currentPortInstance.attribute_instances;
  }
  //if there is a relationclassInstance
  else if (groups.currentRelationclassInstance) {
    attributeInstances = groups.currentRelationclassInstance.attribute_instance;
  }

  //for sorting after sequence number
  const enhancedAttributeInstanceArray: EnhancedAttributeInstance[] = [];
  for (const attributeInstance of attributeInstances) {
    //get the uuid to which the attribute belongs to
    let uuidParent = attributeInstance.assigned_uuid_class_instance;
    if (!uuidParent) {
      uuidParent = attributeInstance.assigned_uuid_port_instance;
    }
    if (!uuidParent) {
      uuidParent = attributeInstance.assigned_uuid_scene_instance;
    }

    let metaAttribute: Attribute | undefined;

    //get instance concept of uuidParent
    if (uuidParent) {
      const classInstance = await instanceUtility.getClassInstance(uuidParent);
      const portInstance = await instanceUtility.getPortInstance(uuidParent);
      const parentSceneInstance = await instanceUtility.getSceneInstance(uuidParent);
      if (classInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          classInstance.uuid_class,
        );
      }
      if (!classInstance && portInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          portInstance.uuid_port,
        );
      }
      if (!classInstance && !portInstance && parentSceneInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          parentSceneInstance.uuid_scene_type,
        );
      }
    }

    // The original dereferences `metaAttribute` unguarded here (it would throw for an
    // orphaned attribute instance). Skipping such a row is the closest safe
    // equivalent — a throw inside a React effect would blank the whole window.
    if (!metaAttribute) continue;

    //if sequence is not set in meta attribute, set it to 1000, otherwise set value
    const sequence = metaAttribute.sequence ?? 1000;
    const uiComponent = metaAttribute.ui_component ?? "text";

    //get enum values from regex if attribute type is enum or boolean
    let facets: string[] = [];
    let facetsString = "";
    if (metaAttribute.attribute_type.regex_value) {
      facetsString = metaAttribute.facets;
    }
    if (facetsString) {
      //split regex at | and push each value to array
      facets = facetsString.split("|");
    }

    enhancedAttributeInstanceArray.push({
      attributeInstance,
      sequence,
      uiType: uiComponent,
      metaAttribute,
      facets,
    });
  }

  //sort array after sequence number
  enhancedAttributeInstanceArray.sort((a, b) => a.sequence - b.sequence);

  for (const enhanced of enhancedAttributeInstanceArray) {
    //get meta attribute of attribute instance
    const metaAttribute = await metaUtility.getMetaAttribute(enhanced.attributeInstance.uuid_attribute);
    //check if attribute is a reference attribute -> attribute_type.role is set
    const isReferenceAttribute = metaAttribute ? metaAttribute.attribute_type.role != null : false;

    if (isReferenceAttribute) {
      groups.reference.push(enhanced);
    }
    //push no table attribute instances to array
    else if (enhanced.attributeInstance.table_attributes.length == 0) {
      groups.plain.push(enhanced);
    }
    //push table attribute table instances to array
    else {
      groups.table.push(enhanced);
    }
  }

  groups.fileTypeUuids = await getFileTypeAttributeInstanceUuids(
    enhancedAttributeInstanceArray.map((enhanced) => enhanced.attributeInstance),
  );

  return groups;
}

/**
 * Which instance owns the attribute being edited. The old `attribute-window` read
 * these off its own component state (`this.currentClassInstance` etc.); here they are
 * passed in, because `applyFieldChange` is a free function. `AttributeGroups` is
 * assignable to this, so callers just hand over the groups they already render.
 */
export interface AttributeOwner {
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  currentRelationclassInstance: RelationclassInstance | null;
}

/**
 * Port of `attribute-window.fieldChange()`: normalise the edited value, refresh the
 * vizrep, propagate to collaborators, and mark the scene dirty so the 5 s auto-save
 * loop patches it.
 *
 * DEVIATION (plan-mandated): the old method awaited
 * `vizrepUpdateChecker.checkForVizRepUpdate(attributeInstance)` directly. Plan §5/§9
 * P8 require publishing `checkForVizRepUpdateByAttributeInstance` instead, which the
 * P4 vizrep-update-checker subscribes to. Same effect and it keeps the view out of the
 * engine's import graph, but the update is now fire-and-forget rather than awaited —
 * so the hybrid-algorithms call below is NOT sequenced after the vizrep update the way
 * the original sequenced it; the two now run concurrently. See state.json → discoveries
 * (P8 ordering, P12). The hybrid algorithms that draw (ObjectSpace) use their own
 * private GraphicContext precisely so that overlap is safe — see
 * engine/hybrid-algorithms/objectspace-algorithms.ts.
 */
export async function applyFieldChange(attributeInstance: AttributeInstance, owner: AttributeOwner): Promise<void> {
  const session = sharedDocService.forTab(globalObject.selectedTab);

  // Skip field changes that are being applied from a remote Yjs update
  if (session?.applyingRemote) return;

  //update attribute value
  attributeInstance.value = attributeInstance.value.toString();

  eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);

  // check if there are changes that require a hybrid algorithm to run (P12: live)
  if (owner.currentClassInstance) {
    await hybridAlgorithmsService.checkHybridAlgorithms(null, [owner.currentClassInstance]);
  } else if (owner.currentPortInstance) {
    await hybridAlgorithmsService.checkHybridAlgorithms(null, null, [owner.currentPortInstance]);
  }

  if (session) {
    // Shared mode: propagate attribute change through Yjs and mark local dirty flag
    if (owner.currentClassInstance) {
      applyLocalChangeToYDoc(
        session.ydoc,
        {
          type: "attribute_value",
          classInstanceUuid: owner.currentClassInstance.uuid,
          attributeUuid: attributeInstance.uuid,
          value: attributeInstance.value,
        },
        session.localOrigin,
      );
    } else if (owner.currentRelationclassInstance) {
      applyLocalChangeToYDoc(
        session.ydoc,
        {
          type: "relation_attribute_value",
          relationClassInstanceUuid: owner.currentRelationclassInstance.uuid,
          attributeUuid: attributeInstance.uuid,
          value: attributeInstance.value,
        },
        session.localOrigin,
      );
    }
    globalObject.doSceneInstancePatchLocal = true;
  } else {
    globalObject.doSceneInstancePatch = true;
  }

  // Undo step for the edit. Keyed on the attribute instance so a slider being dragged
  // (which commits on every release) and a value re-edited straight away collapse into
  // one step, while a different field always starts a new one.
  historyService.record(`edit ${attributeInstance.name || "attribute"}`, {
    coalesceKey: `attribute:${attributeInstance.uuid}`,
  });
}
