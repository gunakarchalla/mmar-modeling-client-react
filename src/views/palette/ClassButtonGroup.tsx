import { globalObject, globalClassObject } from "@/engine";
import PaletteButtonGroup from "./PaletteButtonGroup";

// Port of `views/class-buttongroup/class-buttongroup.{ts,html}`. The old
// onButtonClicked set the selected class on globalClassObject and entered
// DrawingMode (state 2). Reads the classes of the active tab's sceneType.
export default function ClassButtonGroup() {
  return (
    <PaletteButtonGroup
      title="Classes"
      getMetaObjects={() => globalObject.tabContext[globalObject.selectedTab]?.sceneType?.classes}
      onSelect={(uuid) => globalClassObject.setSelectedClassByUUID(uuid)}
      stateToEnter={2}
    />
  );
}
