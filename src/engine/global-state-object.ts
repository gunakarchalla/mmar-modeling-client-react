import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { logger } from "@/resources/services/logger";
import { eventBus } from "@/resources/services/event-bus";
import { useStateStore } from "@/resources/store/stateStore";

/**
 * Port of the old `resources/global_state_object.ts` — the 5-mode interaction state
 * machine (0 SelectionMode, 1 ViewMode, 2 DrawingMode, 3 DrawingModeRelationClass,
 * 4 SimulationMode). DI-stripping recipe: GlobalDefinition / GlobalSelectedObject /
 * Logger / EventAggregator injections become module-singleton imports
 * (EventAggregator -> eventBus, same `.publish` shape). Bodies unchanged EXCEPT:
 *  - `setState`/`onStateChange` additionally push `activeState` into `stateStore`
 *    so the React StateWindow (P6) has a reactive mirror (plan §3.2). The engine
 *    remains the source of truth; this is a one-way engine -> store sync.
 *  - the old `removeAttributeGui` publish payload `{ update: true }` is dropped:
 *    the typed event-bus (plan §5) types the channel as no-payload.
 */
export class GlobalStateObject {
  stateNames: string[];
  activeState: string;
  activeStateLine?: Line2;

  private globalObjectInstance = globalObject;
  private globalSelectedObject = globalSelectedObject;
  private logger = logger;
  private eventAggregator = eventBus;

  constructor() {
    this.stateNames = ["SelectionMode (drag)", "ViewMode", "DrawingMode (insert)", "DrawingModeRelationClass (line)", "SimulationMode"];
    this.activeState = "";
  }
  onStateChange() {
    this.logger.log(`The state has changed to ${this.getState()}`, "info");

    this.eventAggregator.publish("removeAttributeGui");

    this.globalSelectedObject.removeObject();
    if (this.globalObjectInstance.transformControls) {
      this.globalObjectInstance.transformControls.detach();
    }
    //if SelectionMode
    if (this.activeState === this.stateNames[0]) {
      this.globalObjectInstance.transformControls.enabled = true;
      this.logger.log("transformControls enabled", "info");

      //if 3d mode, disable orbitcontrols while in selection mode
      if (!this.globalObjectInstance.threeDimensional) {
        this.globalObjectInstance.orbitControls.enabled = true;
        //enable orbitcontrols zoom
        this.globalObjectInstance.orbitControls.enableZoom = true;
        //disable orbitcontrols rotation
        this.globalObjectInstance.orbitControls.enableRotate = false;
        this.logger.log("orbitControls rotation disabled", "info");
      } else {
        this.globalObjectInstance.orbitControls.enabled = true;
        this.logger.log("orbitControls disabled", "info");
        //enable orbitcontrols zoom
        this.globalObjectInstance.orbitControls.enableZoom = true;
        //disable orbitcontrols rotation
        this.globalObjectInstance.orbitControls.enableRotate = false;
      }

      //set cursor style
      this.globalObjectInstance.elementContainer.style.cursor = "grab";
    }
    //if ViewMode
    else if (this.activeState === this.stateNames[1]) {
      this.globalObjectInstance.transformControls.enabled = false;
      this.globalObjectInstance.orbitControls.enabled = true;
      //enable orbitcontrols zoom
      this.globalObjectInstance.orbitControls.enableZoom = true;
      //enable orbitcontrols rotation
      this.globalObjectInstance.orbitControls.enableRotate = true;
      this.logger.log("transformControls disabled", "info");
      this.logger.log("orbitControls enabled", "info");

      //set cursor style
      this.globalObjectInstance.elementContainer.style.cursor = "pointer";
    }
    //if DrawingMode
    else if (this.activeState === this.stateNames[2]) {
      this.globalObjectInstance.transformControls.enabled = false;
      this.globalObjectInstance.orbitControls.enabled = true;
      //enable orbitcontrols zoom
      this.globalObjectInstance.orbitControls.enableZoom = true;
      //enable orbitcontrols rotation
      this.globalObjectInstance.orbitControls.enableRotate = true;
      this.logger.log("transformControls disabled", "info");
      this.logger.log("orbitControls enabled", "info");

      //set cursor style
      this.globalObjectInstance.elementContainer.style.cursor = "copy";
    }
    //if DrawingModeRelationClass
    else if (this.activeState === this.stateNames[3]) {
      this.globalObjectInstance.transformControls.enabled = false;
      this.globalObjectInstance.orbitControls.enabled = true;
      //enable orbitcontrols zoom
      this.globalObjectInstance.orbitControls.enableZoom = true;
      //enable orbitcontrols rotation
      this.globalObjectInstance.orbitControls.enableRotate = true;
      this.logger.log("transformControls disabled", "info");
      //set cursor style
      this.globalObjectInstance.elementContainer.style.cursor = "copy";
    }
    //if SimulationMode
    else if (this.activeState === this.stateNames[4]) {
      this.globalObjectInstance.transformControls.enabled = false;
      this.globalObjectInstance.orbitControls.enabled = true;
      //enable orbitcontrols zoom
      this.globalObjectInstance.orbitControls.enableZoom = true;
      //enable orbitcontrols rotation
      this.globalObjectInstance.orbitControls.enableRotate = true;
      this.logger.log("transformControls disabled", "info");
      this.logger.log("orbitControls enabled", "info");

      //set cursor style
      this.globalObjectInstance.elementContainer.style.cursor = "help";
    }
  }
  getState() {
    return this.activeState;
  }
  setState(value: number) {
    this.activeState = this.stateNames[value];
    // Reactive mirror for the P6 StateWindow (engine stays the source of truth).
    useStateStore.getState().setActiveState(this.activeState);
    this.onStateChange();
  }
  setActiveStateLine(value2: Line2) {
    this.activeStateLine = value2;
  }

  getActiveStateLine() {
    return this.activeStateLine;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const globalStateObject = new GlobalStateObject();
