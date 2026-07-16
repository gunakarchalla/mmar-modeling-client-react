// Ambient declaration for `troika-three-text`, which ships no TypeScript types.
// The old (non-strict) modeling client tolerated the implicit-any import; this repo
// is strict, so we declare the small surface the graphic-context port uses. `Text`
// is a THREE.Mesh subclass with extra text properties; typing it loosely keeps the
// mechanical port unchanged (userData / sync / text props all stay accessible).
// Copied from the metamodeling twin (src/types/troika-three-text.d.ts) — same
// library version (0.47.2), same usage.
declare module "troika-three-text" {
  import * as THREE from "three";

  export class Text extends THREE.Mesh {
    text: string;
    fontSize: number;
    color: THREE.Color | string | number;
    anchorX: number | string;
    anchorY: number | string;
    font: string | null;
    maxWidth: number;
    sync(callback?: () => void): void;
    dispose(): void;
    [key: string]: any;
  }

  export function preloadFont(options: any, callback?: () => void): void;
}
