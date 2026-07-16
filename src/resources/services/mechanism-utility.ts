import { AttributeInstance, ObjectInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { metaUtility } from "./meta-utility";
import { expressionUtility } from "./expression-utility";
import { instanceUtility } from "./instance-utility";

/**
 * Port of the old modeling `resources/services/mechanism_utility.ts` (plan §10: ★).
 * DI stripped: GlobalDefinition / MetaUtility / ExpressionUtility / InstanceUtility
 * become module-singleton imports. Runs the `mechanism` code strings each render
 * tick — the animator's render loop calls `executeAllMechanisms()` when
 * `globalObject.runMechanism` is set (P3 un-stubs that call in animator.ts).
 *
 * Utility class for executing mechanisms on instances.
 */
export class MechanismUtility {
  private globalObjectInstance = globalObject;
  private metaUtility = metaUtility;
  private expression = expressionUtility;
  private instanceUtility = instanceUtility;

  async executeAllMechanisms() {
    const tabContext = this.globalObjectInstance.tabContext;
    const selectedTab = this.globalObjectInstance.selectedTab;
    const sceneInstance = tabContext[selectedTab]?.sceneInstance;

    if (sceneInstance) {
      // get all attribute instances from the sceneinstance
      const allAttributeInstances: AttributeInstance[] =
        await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance);
      // filter attributes that match mechanism function -> check if value contains 'function'
      const targetAttributeInstances = allAttributeInstances.filter((attributeInstance) =>
        attributeInstance.value.toString().includes("function"),
      );
      //check if attributeType of meta attribute is mechanism -> a8e33bad-9eed-4a24-a4b2-406c5439d13a
      if (targetAttributeInstances.length > 0) {
        for (const attributeInstance of targetAttributeInstances) {
          const attributeTypeUUID = attributeInstance.uuid_attribute;
          const attribute = await this.metaUtility.getMetaAttribute(attributeTypeUUID);
          const attributeType = attribute?.attribute_type;
          if (attributeType?.uuid === "a8e33bad-9eed-4a24-a4b2-406c5439d13a") {
            const generalMechanismCode = attributeInstance.value.toString();
            let contextInstance: ObjectInstance | undefined;
            if (attributeInstance.assigned_uuid_class_instance) {
              contextInstance = await this.instanceUtility.getClassInstance(
                attributeInstance.assigned_uuid_class_instance,
              );
            } else if (attributeInstance.assigned_uuid_port_instance) {
              contextInstance = await this.instanceUtility.getPortInstance(
                attributeInstance.assigned_uuid_port_instance,
              );
            } else if (attributeInstance.assigned_uuid_scene_instance) {
              contextInstance = await this.instanceUtility.getSceneInstance(
                attributeInstance.assigned_uuid_scene_instance,
              );
            }
            if (contextInstance) {
              await this.runMechanismFunction(generalMechanismCode, contextInstance);
            }
          }
        }
      }
    }
  }

  /**
   * Runs the mechanism function with the provided mechanism code.
   * @param mechanismCode The mechanism code to be executed.
   */
  async runMechanismFunction(mechanismCode: string, contextInstance: ObjectInstance): Promise<void> {
    const mechanismFunction = await this.metaUtility.parseMetaFunction(mechanismCode);
    await mechanismFunction(this.expression, contextInstance);
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const mechanismUtility = new MechanismUtility();
