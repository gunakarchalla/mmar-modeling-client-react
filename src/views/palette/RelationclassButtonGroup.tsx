import { globalObject, globalRelationclassObject } from "@/engine";
import PaletteButtonGroup from "./PaletteButtonGroup";

// Port of `views/relationclass-buttongroup/relationclass-buttongroup.{ts,html}`.
// The old onButtonClicked set the selected relationclass on
// globalRelationclassObject and entered DrawingModeRelationClass (state 3).
export default function RelationclassButtonGroup() {
  return (
    <PaletteButtonGroup
      title="Relationclasses"
      getMetaObjects={() =>
        globalObject.tabContext[globalObject.selectedTab]?.sceneType?.relationclasses
      }
      onSelect={(uuid) => globalRelationclassObject.setSelectedRelationClassByUUID(uuid)}
      stateToEnter={3}
    />
  );
}
