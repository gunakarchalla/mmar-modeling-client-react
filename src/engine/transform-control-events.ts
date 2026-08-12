import * as THREE from "three";
import { ObjectInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { instanceUtility } from "@/resources/services/instance-utility";
import { eventBus } from "@/resources/services/event-bus";
import { applyLocalChangeToYDoc } from "@/resources/collaboration/y-mapping";

/**
 * P4 port of the old `services/transform_control_events.ts` (159 lines). REPLACES
 * the P2 no-op stub. DI stripped per the established recipe: GlobalDefinition /
 * GlobalSelectedObject / InstanceUtility injections become module-singleton
 * imports. `scene-initiator.initTransformControls` already registers both methods
 * against the TransformControls `change` / `mouseUp` events.
 *
 * (The P2 stub's docstring guessed "snapping, rounding via math-utility" — the real
 * file does neither; rounding lives in coordinates-updater. Bodies below are the
 * modeling original.)
 *
 * translate / scale / rotate write the moved object's userData custom_variables
 * (and the matching instance custom_variables) and mark them `user_locked: true`
 * so a later vizRep re-run does not reset a label the user positioned by hand.
 * The positional `Object.keys(...)[0..6]` indexing is load-bearing and faithful to
 * the original — graphic_context `graphic_text` writes the pos_name_x/y/z keys
 * first and rx/ry/rz/rw last, which is what makes indices 0-2 the position vars
 * and 3-6 the rotation vars.
 *
 * P10 filled in `syncCustomVariablesToYDoc` (a yjs dependency the plan did not list
 * for this file — it names only coordinates-updater). Like the old file, it reaches
 * collaboration through `globalObject.sharedDocServiceRef` rather than importing the
 * service, which is how the original broke its circular DI.
 */
export class TransformControlsEvents {
  private globalObjectInstance = globalObject;
  private globalSelectedObject = globalSelectedObject;
  private instanceUtility = instanceUtility;
  private eventAggregator = eventBus;

  onTransformControlsPropertyChange() {
    if (this.globalSelectedObject.object) {
      this.globalSelectedObject.getObject();
      //set scale of y to scale of x -> proportional scale
      this.globalSelectedObject.object.scale.setY(this.globalSelectedObject.object.scale.x);
      this.globalObjectInstance.objectScaled = true;
    }

    this.globalObjectInstance.render = true;
  }

  //this event is triggered, when the button is released in the transformControl mode
  async onTransformControlsMouseUp() {
    const controls = this.globalObjectInstance.transformControls;
    const object: THREE.Mesh = controls.object as THREE.Mesh;
    const mode = controls.mode;

    if (controls && object && mode == "translate") {
      let instance: ObjectInstance | undefined;
      const sceneInstace = (await this.instanceUtility.getTabContextSceneInstance())!;
      const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...(await this.instanceUtility.getAllPortInstancesOfTabContext())];
      instance = object_Instances.find((instance_obj) => instance_obj.uuid == object.uuid);
      if (!instance) {
        instance = object_Instances.find((instance_obj) => instance_obj.uuid == object.parent!.uuid);
      }

      //updates the x_rel, y_rel, z_rel of the instance when label is shifted
      if (object.uuid != instance!.uuid && object.userData.custom_variables) {
        const ocv = object.userData.custom_variables as any;
        const icv = instance!.custom_variables as any;
        ocv[Object.keys(ocv)[0]]["value"] = object.position.x;
        ocv[Object.keys(ocv)[0]]["user_locked"] = true;
        ocv[Object.keys(ocv)[1]]["value"] = object.position.y;
        ocv[Object.keys(ocv)[1]]["user_locked"] = true;
        ocv[Object.keys(ocv)[2]]["value"] = object.position.z;
        ocv[Object.keys(ocv)[2]]["user_locked"] = true;

        //update instance custom_variables on instance as well
        icv[Object.keys(ocv)[0]]["value"] = object.position.x;
        icv[Object.keys(ocv)[0]]["user_locked"] = true;
        icv[Object.keys(ocv)[1]]["value"] = object.position.y;
        icv[Object.keys(ocv)[1]]["user_locked"] = true;
        icv[Object.keys(ocv)[2]]["value"] = object.position.z;
        icv[Object.keys(ocv)[2]]["user_locked"] = true;
        // instance.custom_variables = { ...instance.custom_variables, ...object.userData.custom_variables }

        // Propagate the moved label's position variables to collaborators.
        const positionKeys = Object.keys(ocv).slice(0, 3);
        this.syncCustomVariablesToYDoc(instance!, positionKeys);
      }
    }

    //if scale mode we set the scale to the instance custom_variables and we check if the children must be rescaled to hold absolue scale
    //if the children have a scale themselfes, they are ignored
    if (mode == "scale") {
      const sceneInstace = (await this.instanceUtility.getTabContextSceneInstance())!;
      const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...(await this.instanceUtility.getAllPortInstancesOfTabContext())];
      object_Instances.find((instance_obj) => instance_obj.uuid == object.uuid);

      if (!object.userData.custom_variables) {
        object.userData.custom_variables = {};
      }

      object.userData.custom_variables.scale = object.scale;
      object.traverse((child: THREE.Object3D) => {
        if (child != object) {
          const newScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1).divide(object.scale);
          if (!child.userData || !("custom_variables" in child.userData) || !("scale" in child.userData.custom_variables)) {
            child.scale.set(newScale.x, newScale.y, newScale.z);
          } else {
            const scale: THREE.Vector3 = child.userData.custom_variables["scale"];
            child.scale.set(scale.x, scale.y, scale.z);
          }
        }
      });
      //update box
      this.globalSelectedObject.getObject();
    }

    if (controls && object && mode == "rotate") {
      let instance: ObjectInstance | undefined;
      const sceneInstace = (await this.instanceUtility.getTabContextSceneInstance())!;
      const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...(await this.instanceUtility.getAllPortInstancesOfTabContext())];
      instance = object_Instances.find((instance_obj) => instance_obj.uuid == object.uuid);
      if (!instance) {
        instance = object_Instances.find((instance_obj) => instance_obj.uuid == object.parent!.uuid);
      }

      //updates the rx, ry, rz and rw of the instance when label is rotated
      if (object.uuid != instance!.uuid && object.userData.custom_variables) {
        const ocv = object.userData.custom_variables as any;
        const icv = instance!.custom_variables as any;
        ocv[Object.keys(ocv)[3]]["value"] = object.quaternion.x;
        ocv[Object.keys(ocv)[3]]["user_locked"] = true;
        ocv[Object.keys(ocv)[4]]["value"] = object.quaternion.y;
        ocv[Object.keys(ocv)[4]]["user_locked"] = true;
        ocv[Object.keys(ocv)[5]]["value"] = object.quaternion.z;
        ocv[Object.keys(ocv)[5]]["user_locked"] = true;
        ocv[Object.keys(ocv)[6]]["value"] = object.quaternion.w;
        ocv[Object.keys(ocv)[6]]["user_locked"] = true;

        //update instance custom_variables on instance as well
        icv[Object.keys(ocv)[3]]["value"] = object.quaternion.x;
        icv[Object.keys(ocv)[3]]["user_locked"] = true;
        icv[Object.keys(ocv)[4]]["value"] = object.quaternion.y;
        icv[Object.keys(ocv)[4]]["user_locked"] = true;
        icv[Object.keys(ocv)[5]]["value"] = object.quaternion.z;
        icv[Object.keys(ocv)[5]]["user_locked"] = true;
        icv[Object.keys(ocv)[6]]["value"] = object.quaternion.w;
        icv[Object.keys(ocv)[6]]["user_locked"] = true;
        // instance.custom_variables = { ...instance.custom_variables, ...object.userData.custom_variables }

        // Propagate the rotated label's rotation variables to collaborators.
        const rotationKeys = Object.keys(ocv).slice(3, 7);
        this.syncCustomVariablesToYDoc(instance!, rotationKeys);
      }
    }

    this.globalObjectInstance.render = true;

    // One undo step per completed drag (mouse-up), not per frame. `afterTransformSync`
    // matters: the moved mesh is only written back onto the gds instance by the
    // animator's coordinates-updater pass on a LATER frame, so the history service has
    // to flush those writes before it snapshots — otherwise it would record the pose the
    // object had BEFORE the drag. The mode is in the label so the log reads sensibly.
    this.eventAggregator.publish("historyRecord", {
      label: mode ?? "transform",
      afterTransformSync: true,
      coalesceKey: `transform:${object?.uuid ?? ""}:${mode ?? ""}`,
    });
  }

  /**
   * Propagate the given custom-variable keys of an object instance to collaborators
   * editing the same shared scene. No-op when the scene is not shared or when we are
   * currently applying a remote update (avoids echoing it back).
   */
  private syncCustomVariablesToYDoc(instance: ObjectInstance, keys: string[]): void {
    const session = this.globalObjectInstance.sharedDocServiceRef?.forTab(this.globalObjectInstance.selectedTab);
    if (!session || session.applyingRemote) return;
    const customVariables = instance.custom_variables as Record<string, unknown>;
    for (const key of keys) {
      if (!key || customVariables[key] === undefined) continue;
      applyLocalChangeToYDoc(session.ydoc, { type: "custom_variable", classInstanceUuid: instance.uuid, key, value: customVariables[key] }, session.localOrigin);
    }
    this.globalObjectInstance.doSceneInstancePatchLocal = true;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const transformControlsEvents = new TransformControlsEvents();
