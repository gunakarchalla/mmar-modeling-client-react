import { v4 as uuidv4 } from "uuid";
import { SceneInstance } from "@gds";
import type { AttributeInstance } from "@gds";

/**
 * The uuid-rewriting deep copy behind the "Copy SceneInstance" dialog
 * (`dialogs/dialog-copy-scene/dialog-copy-scene.ts:45-152`).
 *
 * Split out of the component (the same plain-TS-module split P6 used for
 * views/layout/tabActions.ts and P8 for views/attribute-window/attributeModel.ts)
 * so the uuid rewriting is unit-testable without rendering a dialog.
 *
 * HOW IT WORKS (faithful to the original): the SceneInstance is serialised to JSON
 * ONCE, then every uuid in the object graph is replaced by a fresh v4 uuid via a
 * global string replace on that JSON text. Working on the text — rather than walking
 * and assigning — is what keeps the copy internally consistent for free: a uuid that
 * appears both as an identity (`class_instance.uuid`) and as a cross-reference
 * (`role_instance.uuid_has_reference_class_instance`, `assigned_uuid_class_instance`,
 * …) is rewritten at BOTH sites in the same pass. That is why this is not "cleaned
 * up" into a structured walk.
 *
 * DEVIATIONS from the old client, both deliberate:
 *
 * 1. Revival uses `SceneInstance.fromJS`, not the app's `plainToInstance` (which the
 *    old dialog used). P3 established that the app and gds each bundle their own
 *    class-transformer copy, so the app's plainToInstance only SHALLOW-revives gds
 *    classes — nested class_instances would stay plain Objects and every downstream
 *    `instanceof ClassInstance` check (expression-utility, the graphic context) would
 *    fail. `fromJS` runs inside gds and deep-revives.
 *
 * 2. `table_attributes` are rewritten RECURSIVELY. The original only descended one
 *    level (`attributeInstance.table_attributes.forEach(...)`), so a table column
 *    whose own attribute is a table — which the demo metamodel really does use, e.g.
 *    Robotic system → Joint's `button` columns (P8) — kept the ORIGINAL's uuid in the
 *    copy. Two scene instances would then claim the same attribute-instance uuid and
 *    the copy's PATCH/POST would collide with the original's row. Rewriting more
 *    uuids consistently is strictly safer than rewriting fewer, and "every uuid is
 *    fresh" is this function's whole contract (plan §0: do the closest correct thing).
 */

/** Collects an attribute instance's uuid plus, recursively, its table attributes'. */
function collectAttributeUuids(attributeInstances: AttributeInstance[] | undefined): string[] {
  const uuids: string[] = [];
  for (const attributeInstance of attributeInstances ?? []) {
    uuids.push(attributeInstance.uuid);
    // Deviation 2: recurse instead of the original's single level.
    uuids.push(...collectAttributeUuids(attributeInstance.table_attributes));
  }
  return uuids;
}

/**
 * Every uuid in a SceneInstance's object graph, in the order the old dialog visited
 * them (scene → its attributes → classes (attributes, tables, ports + their
 * attributes) → relationclasses (attributes, tables, both role instances)).
 * Order does not affect the result — each uuid is replaced independently — but it
 * keeps this reviewable against the original.
 */
export function collectSceneInstanceUuids(sceneInstance: SceneInstance): string[] {
  const uuids: string[] = [sceneInstance.uuid];

  uuids.push(...collectAttributeUuids(sceneInstance.attribute_instances));

  for (const classInstance of sceneInstance.class_instances ?? []) {
    uuids.push(classInstance.uuid);
    uuids.push(...collectAttributeUuids(classInstance.attribute_instance));

    for (const port of classInstance.port_instance ?? []) {
      uuids.push(port.uuid);
      uuids.push(...collectAttributeUuids(port.attribute_instances));
    }
  }

  for (const relationclassInstance of sceneInstance.relationclasses_instances ?? []) {
    uuids.push(relationclassInstance.uuid);
    uuids.push(...collectAttributeUuids(relationclassInstance.attribute_instance));

    if (relationclassInstance.role_instance_from) {
      uuids.push(relationclassInstance.role_instance_from.uuid);
    }
    if (relationclassInstance.role_instance_to) {
      uuids.push(relationclassInstance.role_instance_to.uuid);
    }
  }

  // A uuid can legitimately appear twice in the walk (e.g. a role instance already
  // seen); replacing it twice would rewrite the second occurrence's fresh uuid, so
  // de-duplicate before replacing.
  return [...new Set(uuids.filter(Boolean))];
}

/** Escapes a uuid for use in a RegExp. UUIDs contain no metacharacters, but the old
 * code built `new RegExp(uuid, 'g')` from unvalidated data — this keeps that safe if
 * a malformed uuid ever shows up. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deep-copies a SceneInstance, giving every instance in the graph a fresh uuid and
 * applying the new name/description. Returns a fully revived gds SceneInstance.
 */
export function duplicateSceneInstance(
  sceneInstance: SceneInstance,
  name: string,
  description: string,
): SceneInstance {
  let sceneInstanceAsString = JSON.stringify(sceneInstance);

  for (const oldUuid of collectSceneInstanceUuids(sceneInstance)) {
    sceneInstanceAsString = sceneInstanceAsString.replace(
      new RegExp(escapeRegExp(oldUuid), "g"),
      uuidv4(),
    );
  }

  // Deviation 1: gds fromJS, never the app's plainToInstance (P3).
  const newSceneInstance = SceneInstance.fromJS(JSON.parse(sceneInstanceAsString)) as SceneInstance;
  newSceneInstance.name = name;
  newSceneInstance.description = description;
  return newSceneInstance;
}
