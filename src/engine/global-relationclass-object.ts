import { RelationclassInstance, UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { logger } from "@/resources/services/logger";

/**
 * Port of the old `resources/global_relationclass_object.ts` (DI-stripping recipe):
 * GlobalDefinition / Logger injections become module-singleton imports. Bodies
 * unchanged except the dead `document.getElementById("class_dropdown")` lookup in
 * `setSelectedRelationClassByUUID` (its usage was already commented out) is dropped.
 */
export class GlobalRelationclassObject {
  relationClassUUID: UUID[];
  relationClassNames: string[];
  relationClassGeometry: string[];
  selectedRelationClass: string;
  relationclassInstanceInCreation!: RelationclassInstance;

  private globalObjectInstance = globalObject;
  private logger = logger;

  constructor() {
    this.relationClassNames = [];
    this.relationClassGeometry = [];
    this.selectedRelationClass = "";
    this.relationClassUUID = [];
  }

  initRelationClasses() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    const tabContextClasses = tabContext["sceneType"].relationclasses;
    //for each class
    for (const element of tabContextClasses) {
      this.relationClassNames.push(element.name);
      this.relationClassGeometry.push(JSON.stringify(element.geometry));
      this.relationClassUUID.push(element.uuid);
    }
  }

  onObjectChange() {
    // push to log file
    this.logger.log(`The selected relationClass object has changed to ${this.getSelectedRelationClass()}`, "info");
  }

  getSelectedRelationClass() {
    return this.selectedRelationClass;
  }

  setSelectedObject(index: number) {
    this.selectedRelationClass = JSON.parse(this.relationClassNames[index]);
    this.onObjectChange();
  }
  setSelectedRelationClassByUUID(theUUID: string) {
    const index = this.relationClassUUID.findIndex((uuid) => uuid === theUUID);
    this.selectedRelationClass = this.relationClassNames[index];
    this.onObjectChange();
  }

  //get selected relationclass uuid
  getSelectedRelationClassUUID() {
    const index = this.relationClassNames.findIndex((name) => name === this.selectedRelationClass);
    return this.relationClassUUID[index];
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const globalRelationclassObject = new GlobalRelationclassObject();
