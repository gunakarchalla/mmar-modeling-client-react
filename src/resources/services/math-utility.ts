import * as THREE from "three";

/**
 * Port of the old `resources/services/math_utility.ts` (DI-stripping recipe). The
 * original had no injected dependencies (the `singleton()` call was even missing its
 * `@`), so this is a straight 1:1 port exposed as a module singleton. Pure helpers
 * for rounding an object's position / quaternion — used by the coordinates updater
 * (P4) and the interaction handler (P5).
 */
export class MathUtility {
  roundPosOfObject(object: THREE.Mesh, precision: number) {
    let x = object.position.x;
    x = Math.round(x * precision) / precision;
    object.position.x = x;
    let y = object.position.y;
    y = Math.round(y * precision) / precision;
    object.position.y = y;
  }

  roundQuaternionOfObject(object: THREE.Mesh, precision: number) {
    let x = object.quaternion.x;
    x = Math.round(x * precision) / precision;
    object.quaternion.x = x;
    let y = object.quaternion.y;
    y = Math.round(y * precision) / precision;
    object.quaternion.y = y;
    let z = object.quaternion.z;
    z = Math.round(z * precision) / precision;
    object.quaternion.z = z;
    let w = object.quaternion.w;
    w = Math.round(w * precision) / precision;
    object.quaternion.w = w;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const mathUtility = new MathUtility();
