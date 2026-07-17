import * as THREE from "three";
import { AttributeInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { GraphicContext } from "@/engine/graphic-context";
import { instanceUtility } from "@/resources/services/instance-utility";
import {
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  SIZE_IN_METERS_ATTRIBUTE_UUID,
} from "@/constants";

/**
 * P12 port of `resources/hybridAlgorithms/objectspace_algorithms.ts` (plan §10 ★ —
 * no metamodeling twin). DI stripped: InstanceUtility / GlobalDefinition become
 * module-singleton imports.
 *
 * These are the ObjectSpace "hybrid algorithms": they replace an instance's mesh
 * geometry/material in place — with an uploaded GLTF (augmentation), or with a
 * textured plane sized from an uploaded image (detectable) — instead of going through
 * the normal vizRep pipeline. Reached from `hybridAlgorithmsService`, never directly.
 *
 * DELIBERATE DEVIATION — a PRIVATE `new GraphicContext()` per call, where the old
 * class injected the SHARED `@singleton()` one and wiped it before/after each use
 * (`gc.resetInstance()`). This is a fix for a hazard THIS PORT introduced, not a
 * cleanup: `graphic_gltf`/`graphic_cube` accumulate into `gc.object3D` and
 * `getMergedObjects()` merges whatever is in there. The old client could safely share
 * one context because it `await`ed the vizrep update to completion BEFORE running the
 * hybrid algorithms. P8 replaced that await with a fire-and-forget
 * `checkForVizRepUpdateByAttributeInstance` publish (plan §5/§9 P8), so the shared
 * `vizrepUpdateChecker.gc` draw is now genuinely in flight when we get here — and a
 * shared `resetInstance()` would drop its half-built meshes (silently: nothing throws).
 * A private context cannot race it, and the ctor is no-arg here (P5/P7 precedent).
 * The resetInstance() calls are kept so the drawing sequence stays byte-faithful.
 * See state.json → discoveries (P8 ordering note, P12).
 */
export class ObjectspaceAlgorithms {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;

  //99ccdf26-98ec-4424-9443-490bcb825307 is the uuid for the augmentation metaclass
  async checkAugmentationsInstance(attributeInstance?: AttributeInstance) {
    if (!attributeInstance) return;

    // get the uuid of instance the attributeInstance belongs to
    let uuidInstance = "";
    if (attributeInstance.assigned_uuid_class_instance) {
      uuidInstance = attributeInstance.assigned_uuid_class_instance;
    } else if (attributeInstance.assigned_uuid_port_instance) {
      uuidInstance = attributeInstance.assigned_uuid_port_instance;
    } else if (attributeInstance.assigned_uuid_scene_instance) {
      uuidInstance = attributeInstance.assigned_uuid_scene_instance;
    }

    //if there is an attributeInstance
    if (attributeInstance.value?.startsWith("{") && uuidInstance) {
      const gc = new GraphicContext();
      //create object3d
      await gc.resetInstance();
      await gc.graphic_gltf(attributeInstance.value);
      const gltf = await gc.getMergedObjects();
      await gc.resetInstance();

      // get scene
      const threeScene = this.globalObjectInstance.scene;
      const object = threeScene.getObjectByProperty("uuid", uuidInstance) as THREE.Mesh | undefined;
      if (object) {
        object.geometry = gltf.geometry;
        object.material = gltf.material;
      }
    }
  }

  //a8e78bba-087e-407f-974a-18c36d830bc8 is the uuid for the detectable metaclass
  async checkDetectableInstance(attributeInstance?: AttributeInstance) {
    if (!attributeInstance) return;

    // get the uuid of instance the attributeInstance belongs to
    let uuidInstance = "";
    if (attributeInstance.assigned_uuid_class_instance) {
      uuidInstance = attributeInstance.assigned_uuid_class_instance;
    }

    const classInstance = await this.instanceUtility.getClassInstance(uuidInstance);

    if (classInstance) {
      //get the attributeInstance of the attribute d334dd62-5651-4d0f-a7a0-13718f20da36 -> image to detect
      const imageToDetectAttributeInstances: AttributeInstance[] = classInstance.attribute_instance.filter(
        (attribute_instance) => attribute_instance.uuid_attribute == IMAGE_TO_DETECT_ATTRIBUTE_UUID,
      );
      //get the attributeInstance of the attribute c1d9b467-08d8-4350-aa62-a47d6939b6ec -> size in meters
      const widthInMeters: AttributeInstance[] = classInstance.attribute_instance.filter(
        (attribute_instance) => attribute_instance.uuid_attribute == SIZE_IN_METERS_ATTRIBUTE_UUID,
      );

      //if there is an attributeInstance
      if (
        imageToDetectAttributeInstances.length > 0 &&
        widthInMeters.length > 0 &&
        Number(widthInMeters[0].value) > 0 &&
        imageToDetectAttributeInstances[0].value.startsWith("data:image/")
      ) {
        //create texture
        const textureOfBase64 = await this.getTextureOfBase64Image(imageToDetectAttributeInstances[0].value);
        const ratio = textureOfBase64.width / textureOfBase64.height;
        const width: number = Number(widthInMeters[0].value);
        const gc = new GraphicContext();
        await gc.resetInstance();
        const plane: THREE.Mesh = await gc.graphic_cube(
          width,
          width * (1 / ratio),
          0.001,
          "white",
          imageToDetectAttributeInstances[0].value,
        );
        await gc.resetInstance();
        // get scene
        const threeScene = this.globalObjectInstance.scene;
        const object = threeScene.getObjectByProperty("uuid", classInstance.uuid) as THREE.Mesh | undefined;
        if (object) {
          object.geometry = plane.geometry;
          object.material = plane.material;
        }
      }
    }
  }

  async getTextureOfBase64Image(
    base64Image: string,
  ): Promise<{ texture: THREE.Texture; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const texture = new THREE.Texture(img);

      img.onload = () => {
        texture.needsUpdate = true;
        resolve({ texture: texture, width: img.width, height: img.height });
      };
      img.onerror = (error) => {
        reject(error);
      };
      img.src = base64Image;
    });
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const objectspaceAlgorithms = new ObjectspaceAlgorithms();
