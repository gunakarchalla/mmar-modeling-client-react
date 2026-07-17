import { Attribute, AttributeInstance, Class, ClassInstance, PortInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { objectspaceAlgorithms } from "@/engine/hybrid-algorithms/objectspace-algorithms";
import { statechangeAlgorithms } from "@/engine/hybrid-algorithms/statechange-algorithms";
import { urdfPoseService, type UrdfTaggedClassInstance } from "@/engine/hybrid-algorithms/urdf-pose-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import {
  ROBOTIC_SYSTEM_SCENETYPE_UUID,
  OBJECTSPACE_SCENETYPE_UUID,
  STATECHANGE_SCENETYPE_UUID,
  OBJECT_3D_ATTRIBUTE_UUID,
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  REFERENCE_CLASS_UUID,
} from "@/constants";

/**
 * P12 port of `resources/services/hybrid_algorithms_service.ts` (plan §10 maps it here,
 * alongside the four hybridAlgorithms/* files it dispatches to). DI stripped: every
 * Aurelia injection becomes a module-singleton import.
 *
 * "Hybrid algorithms" are per-metamodel behaviours that run OUTSIDE the vizRep pipeline
 * — they mutate meshes/attributes directly. This service is the single entry point:
 * every caller (attribute window, table/reference dialogs, scenegroup, copy-scene, the
 * ThreeCanvas 1 Hz heartbeat) calls `checkHybridAlgorithms(...)` and this file decides
 * what — if anything — applies, based on the OPEN TAB's scene type. For any other scene
 * type it is a no-op, which is why the call sites need no scene-type checks of their own.
 *
 * ROUTING (all gated on `tabContext.length > 0`):
 *   Robotic system -> a Joint "Origin" table edit re-poses the URDF robot. This branch
 *                     `return`s, so the ObjectSpace/Statechange passes below never run
 *                     for a robotic scene (see the try/finally note at the call site).
 *   ObjectSpace    -> Object 3D / Image to detect attribute edits swap an instance's mesh.
 *   Statechange    -> Reference class instances adopt their referenced object's mesh.
 */
export class HybridAlgorithmsService {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;
  private objectspaceAlgorithms = objectspaceAlgorithms;
  private statechangeAlgorithms = statechangeAlgorithms;
  private urdfPoseService = urdfPoseService;
  private logger = logger;

  async checkHybridAlgorithms(
    attributeInstance?: AttributeInstance | null,
    classInstances?: ClassInstance[] | null,
    portInstances?: PortInstance[] | null,
    currentClass?: Class | null,
    currentAttribute?: Attribute | null,
  ) {
    // check if any open tabs
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

      // 113c3133-bf77-493a-a36f-553e77832280 is the uuid for the Robotic System SceneType
      if (sceneInstance && sceneInstance.uuid_scene_type == ROBOTIC_SYSTEM_SCENETYPE_UUID) {
        // FAITHFUL CONTROL FLOW: the original's `finally { return; }` swallows any error
        // AND unconditionally returns, so a robotic-system scene never reaches the
        // ObjectSpace/Statechange passes below. `return` in a finally is a lint error
        // (no-unsafe-finally) and reads like a mistake, so it is spelled out here: the
        // try/catch logs, and the return is unconditional either way. Behaviour is
        // identical; only the syntax changed.
        try {
          const currentClassName = (currentClass?.name || "").toLowerCase();
          const currentAttributeName = (currentAttribute?.name || "").toLowerCase();
          // DEVIATION: the original indexes `classInstances[0]` UNGUARDED. Callers that
          // pass only an attributeInstance therefore throw a TypeError here, which the
          // catch below turns into a logger 'error' — i.e. a red app-wide Snackbar (P1).
          // That path is not hypothetical: roboticsystem-algorithms.setReferenceAttribute
          // calls `checkHybridAlgorithms(attrInst)` for every Child/Parent link, so a
          // URDF import would pop one error toast per joint. The surrounding
          // `classInstances[0] && hasUrdfRef` guard shows the intent is plainly "skip
          // when absent", so `?.[0]` skips quietly. Same class of judgement as P8's
          // reference-attribute typo fix (plan §0: do the closest correct thing).
          const firstClassInstance = classInstances?.[0];
          const hasUrdfRef = !!(firstClassInstance && (firstClassInstance as UrdfTaggedClassInstance).urdfRef);

          if (firstClassInstance && hasUrdfRef && currentClassName === "joint" && currentAttributeName === "origin") {
            // `attributeInstance` here is the EDITED CELL; the caller (TableAttributeDialog)
            // passes the parent Origin table attribute via the class instance's own
            // attribute list. Kept exactly as the original called it.
            await this.urdfPoseService.tryUpdateRobotFromJointOriginEdit(firstClassInstance, attributeInstance!);
          }
        } catch (err) {
          this.logger?.log(`Error handling table attribute change for URDF pose update: ${describeError(err)}`, "error");
        }
        return;
      }

      //if attributeInstance passed
      if (attributeInstance) {
        // a3b35b86-2636-4987-8cc4-814f468f6c4b is the uuid for the ObjectSpace SceneType
        if (sceneInstance && sceneInstance.uuid_scene_type == OBJECTSPACE_SCENETYPE_UUID) {
          //check if there is an augmentation or detectable
          //only check if the attributeInstance is from attribute Object 3D
          if (attributeInstance.uuid_attribute == OBJECT_3D_ATTRIBUTE_UUID) {
            await this.objectspaceAlgorithms.checkAugmentationsInstance(attributeInstance);
          }
          //only check if the attributeInstance is from attribute Image to detect
          if (attributeInstance.uuid_attribute == IMAGE_TO_DETECT_ATTRIBUTE_UUID) {
            await this.objectspaceAlgorithms.checkDetectableInstance(attributeInstance);
          }
        }
      }

      //if classInstances passed
      if (classInstances) {
        //we have to check for each classInstance if there is an augmentation or detectable attribute instance
        const attributeInstancesObject3D = await this.getObject3DAttributeInstances(classInstances);
        for (const object3DAttributeInstance of attributeInstancesObject3D) {
          await this.objectspaceAlgorithms.checkAugmentationsInstance(object3DAttributeInstance);
        }
        const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(classInstances);
        for (const imageAttributeInstance of attributeInstancesImageToDetect) {
          await this.objectspaceAlgorithms.checkDetectableInstance(imageAttributeInstance);
        }

        // ada138a9-646c-4df4-8622-fb79092a9ad0 is the uuid of the clas "Reference"
        const referenceClassInstances = await this.getReferenceClassInstances(classInstances);
        if (referenceClassInstances) {
          for (const classInstance of referenceClassInstances) {
            await this.statechangeAlgorithms.updateThreejsObject(classInstance);
          }
        }
      }

      //if portInstances passed
      if (portInstances) {
        //we have to check for each portInstance if there is an augmentation or detectable attribute instance
        const attributeInstancesObject3D = await this.getObject3DAttributeInstances(portInstances);
        for (const object3DAttributeInstance of attributeInstancesObject3D) {
          await this.objectspaceAlgorithms.checkAugmentationsInstance(object3DAttributeInstance);
        }
        const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(portInstances);
        for (const imageAttributeInstance of attributeInstancesImageToDetect) {
          await this.objectspaceAlgorithms.checkDetectableInstance(imageAttributeInstance);
        }
      }

      //run hybrid algorithm for Statechange -> reference
      // 239c5597-6cc9-498a-bf61-432cf85b3835 is the uuid for the ObjectSpace Statechange
      if (sceneInstance && sceneInstance.uuid_scene_type == STATECHANGE_SCENETYPE_UUID) {
        //check if there is an Reference Class Instance
        await this.statechangeAlgorithms.checkForReference();
      }
    }
  }

  async getObject3DAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
    return this.collectAttributeInstances(parentInstances, OBJECT_3D_ATTRIBUTE_UUID);
  }

  async getImageToDetectAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
    return this.collectAttributeInstances(parentInstances, IMAGE_TO_DETECT_ATTRIBUTE_UUID);
  }

  /**
   * The old file had getObject3DAttributeInstances / getImageToDetectAttributeInstances
   * as two byte-identical methods differing only in the uuid they filter on; folded into
   * one helper. Both public methods are kept — they are part of the class's surface and
   * the ports/classes branches above call them by name.
   *
   * The `attribute_instance` / `attribute_instances` double-read is NOT redundant: gds
   * names the field `attribute_instance` on ClassInstance and PortInstance, and the old
   * client read both spellings defensively. Kept.
   */
  private collectAttributeInstances(
    parentInstances: ClassInstance[] | PortInstance[],
    uuidAttribute: string,
  ): AttributeInstance[] {
    let attributeInstances: AttributeInstance[] = [];
    for (const parentInstance of parentInstances) {
      const bag = parentInstance as unknown as {
        attribute_instance?: AttributeInstance[];
        attribute_instances?: AttributeInstance[];
      };
      //check if there is a property attribute_instance
      if (bag.attribute_instance) {
        attributeInstances = attributeInstances.concat(bag.attribute_instance);
      }
      //check if there is a property attribute_instances
      if (bag.attribute_instances) {
        attributeInstances = attributeInstances.concat(bag.attribute_instances);
      }
    }
    return attributeInstances.filter((attributeInstance) => attributeInstance.uuid_attribute == uuidAttribute);
  }

  async updateHybridAlgorithmAttributes() {
    // check if open tab is an ObjectSpace Scene
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      // if sceneInstance is a Statechange SceneType
      if (sceneInstance?.uuid_scene_type == STATECHANGE_SCENETYPE_UUID) {
        //update the reference class attribute instance values
        await this.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues();
      }
    }
  }

  async getReferenceClassInstances(classInstances: ClassInstance[]) {
    const referenceClassInstances: ClassInstance[] = [];
    for (const classInstance of classInstances) {
      if (classInstance.uuid_class == REFERENCE_CLASS_UUID) {
        referenceClassInstances.push(classInstance);
      }
    }
    return referenceClassInstances;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const hybridAlgorithmsService = new HybridAlgorithmsService();
