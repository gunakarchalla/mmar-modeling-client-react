import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { ClassInstance, Attribute, AttributeInstance, UUID, Class, Relationclass, RelationclassInstance, SceneInstance, PortInstance, RoleInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalClassObject } from "@/engine/global-class-object";
import { globalRelationclassObject } from "@/engine/global-relationclass-object";
import { globalStateObject } from "@/engine/global-state-object";
import { graphicContext } from "@/engine/graphic-context";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { eventBus } from "@/resources/services/event-bus";

/**
 * P5 port of the old `resources/instance_creation_handler.ts` (631 lines,
 * DI-stripping recipe): GlobalDefinition / GlobalClassObject /
 * GlobalRelationclassObject / GlobalStateObject / MetaUtility / InstanceUtility /
 * GraphicContext / Logger / EventAggregator injections become module-singleton
 * imports (EventAggregator -> eventBus). Bodies are otherwise faithful to the
 * modeling original.
 *
 * MODELING DELTAS kept vs the metamodeling twin's instance-creation-handler (which
 * this file is NOT a copy of — the twin has no scene instances so it omits them):
 *  - `createClassInstance` / `createRelationclassInstance` publish
 *    `sceneInstanceMutated` (SimulationWindow, P12, listens). The extra
 *    action/kind/instanceUuid fields ride along on the widened payload (see
 *    event-bus.ts) — plan §5 only mandates `sceneInstanceUuid`.
 *  - `class_instance.name = metaclass.name` for a real class (the twin appends the
 *    uuid; the modeling client keeps the bare meta name).
 *  - `createAttributeInstance` keeps the nested-table recursion branch (a table
 *    column whose own attribute is itself a table) — the twin flattened it away.
 *  - `portInstance.name = port.name` after createPortInstance.
 *
 * Strict-TS: nullable locals widened to `| null`/`| undefined`; definite-assignment
 * (`!`) on locals only set in a branch and on meta lookups that return `| undefined`;
 * `getTabContextSceneInstance()` (returns `| undefined`) non-null-asserted at the
 * call site. `null as any` preserves the original's explicit-null arguments through
 * the gds constructors' non-null parameter types.
 */
export class InstanceCreationHandler {
  private globalObjectInstance = globalObject;
  private globalClassObject = globalClassObject;
  private globalRelationclassObject = globalRelationclassObject;
  private globalStateObject = globalStateObject;
  private metaUtility = metaUtility;
  private instanceUtility = instanceUtility;
  private gc = graphicContext;
  private logger = logger;
  private eventAggregator = eventBus;

  //create_uuid
  create_UUID() {
    let dt = new Date().getTime();
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  }

  //-------------------------------------------------
  // attribute_instance
  //-------------------------------------------------
  async createAttributeInstance(attribute: Attribute, assigned_uuid_scene_instance: string, assigned_uuid_class_instance: string, instance_value: string, assigned_uuid_port_instance?: string, is_propagated?: boolean, uuid_reference_attribute?: string, table_attributes?: AttributeInstance[], table_attribute_reference?: string, role_from?: RoleInstance) {
    const uuid = this.create_UUID();

    let class_instance: ClassInstance | null | undefined = null;
    let scene_instance: SceneInstance | null | undefined = null;
    let port_instance: PortInstance | null | undefined = null;

    //if assigned_uuid_class_instance is not null then get the class instance
    if (assigned_uuid_class_instance) {
      class_instance = await this.instanceUtility.getClassInstance(assigned_uuid_class_instance);
    } else if (assigned_uuid_scene_instance) {
      scene_instance = await this.instanceUtility.getSceneInstance(assigned_uuid_scene_instance);
    } else if (assigned_uuid_port_instance) {
      port_instance = await this.instanceUtility.getPortInstance(assigned_uuid_port_instance);
    }

    const attribute_instance: AttributeInstance = new AttributeInstance(uuid, attribute.uuid, assigned_uuid_scene_instance, assigned_uuid_class_instance, instance_value, assigned_uuid_port_instance, is_propagated, uuid_reference_attribute, table_attributes, table_attribute_reference, role_from);

    //push to log file
    this.logger.log("Attribute Instance " + attribute_instance.value + " created", "done");

    //if instance is a instance for a table, create the first row of tabel attribute instances
    if (attribute.attribute_type.has_table_attribute != null) {
      const attribute_type = attribute.attribute_type;
      const has_table_attribute = attribute_type.has_table_attribute;

      for (const column of has_table_attribute) {
        let newAttributeInstance: AttributeInstance;
        if (column.attribute.attribute_type.has_table_attribute.length > 0) {
          newAttributeInstance = await this.createAttributeInstance(
            column.attribute,
            null as any,
            null as any,
            "",
            null as any,
            null as any,
            null as any,
            null as any, // No nested table_attributes yet
            column.attribute.uuid, // Reference to the parent table attribute
            role_from,
          );
        } else {
          newAttributeInstance = new AttributeInstance(
            this.create_UUID(),
            column.attribute.uuid,
            null as any,
            null as any,
            //get attribute type default value
            attribute.default_value ? attribute.default_value : "not defined",
            null as any,
            null as any,
            null as any,
            null as any,
            column.attribute.uuid,
            role_from,
          );

          newAttributeInstance.name = column.attribute.name;
        }
        newAttributeInstance.table_row = 0;
        attribute_instance.table_attributes.push(newAttributeInstance);
      }
    }

    // if instance is a cell in the table
    if (table_attribute_reference != null) {
      // empty in original
    }

    //if attached to class_instance
    if (assigned_uuid_class_instance) {
      // add attribute_instance to class_instance
      const attribute_instances = class_instance!.attribute_instance;
      attribute_instances.push(attribute_instance);
    }

    if (assigned_uuid_scene_instance) {
      // add attribute_instance to scene_instance
      const attribute_instances: AttributeInstance[] = scene_instance!.attribute_instances;
      attribute_instances.push(attribute_instance);
    }

    if (assigned_uuid_port_instance) {
      // add attribute_instance to port_instance
      const attribute_instances = port_instance!.attribute_instances;
      attribute_instances.push(attribute_instance);
    }

    // add attribute_instance to global.attribute_instance
    this.globalObjectInstance.attribute_instances.push(attribute_instance);
    attribute_instance.name = attribute.name;

    return attribute_instance;
  }

  //-------------------------------------------------
  // bendpoint_instance
  //-------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/ban-types -- faithful port: the original geometry param is typed `Function` (only `.toString()` is called on it)
  async createBendpointInstance(x: number, y: number, z: number, geometry: Function, bendPointClassUUID: string) {
    //we round the position
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    z = Math.round(z * 10) / 10;

    const bendpoint_class_instance: ClassInstance = await this.createClassInstance(this.create_UUID(), x, y, z, bendPointClassUUID, "class");

    //geometry of bendpoint_class
    const stringFunction = geometry;

    //parse the string function from the metamodel to a js function
    const metaFunction = await this.metaUtility.parseMetaFunction(stringFunction.toString());

    //reset gc instance
    this.gc.resetInstance();

    //we store the metafunction in the class_instance. With that we can recalculate the objects if necessary
    bendpoint_class_instance.geometry = metaFunction;

    await this.gc.runVizRepFunction(metaFunction);
    await this.gc.drawVizRep(new THREE.Vector3(x, y, z), bendpoint_class_instance);
    this.globalObjectInstance.render = true;

    return bendpoint_class_instance;
  }

  //-------------------------------------------------
  // create_class_instance
  //-------------------------------------------------

  async createClassInstance(uuid: UUID, x: number, y: number, z: number, classUUID: string, type?: string) {
    //create uuid and class_instance
    let class_instance!: ClassInstance;

    //get the metaclass for the classInstance to create
    //we must distinguish between class and relationclass
    let metaclass!: Class;
    if (type == "class" || type == "bendpoint") {
      metaclass = (await this.metaUtility.getMetaClass(classUUID)) as Class;
    } else if (type == "relation") {
      metaclass = (await this.metaUtility.getMetaRelationclass(classUUID)) as Relationclass;
    }

    //------------------------------------
    // if instance is for class: create class Instance with values from classObject
    //------------------------------------
    if (type == "class") {
      this.logger.log(`create instance of ClassInstance for class: ${classUUID}`, "info");
      class_instance = new ClassInstance(uuid, classUUID);
      class_instance.name = metaclass.name;
      class_instance.coordinates_2d = { x, y, z };

      //push to log file
      this.logger.log(`Class Instance ${class_instance.uuid} created`, "done");
    }

    //------------------------------------
    // if instance is for a bendpoint: create class Instance with values from classObject
    //------------------------------------
    if (type == "bendpoint") {
      this.logger.log(`create instance of ClassInstance for a bendpoint`, "info");
      const uuid_is_bendpoint_for_relationclass = this.globalStateObject.activeStateLine!;
      class_instance = new ClassInstance(uuid, this.globalClassObject.getSelectedClass() + "_" + uuid, metaclass.uuid);

      class_instance.coordinates_2d = { x, y, z };
      class_instance.uuid_relationclass_bendpoint = uuid_is_bendpoint_for_relationclass.uuid;

      //push to log file
      this.logger.log(`Bendpoint with UUID ${class_instance.uuid} created`, "done");
    }

    //add class_instance to scene_instance
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const class_instances = sceneInstance.class_instances;
    class_instances.push(class_instance);
    sceneInstance.class_instances = class_instances;

    this.logger.log(`Class Instance ${class_instance.uuid} added to scene_instance ${sceneInstance.uuid}`, "done");

    // Notify listeners (e.g., SimulationWindow) that the active SceneInstance has changed.
    this.eventAggregator.publish("sceneInstanceMutated", {
      sceneInstanceUuid: sceneInstance.uuid,
      action: "added",
      kind: type || "class",
      instanceUuid: class_instance.uuid,
    });

    //set current class_instance in global object
    this.globalObjectInstance.current_class_instance = class_instance;

    //for each attribute in metamodel for this class create an instance of the attribute
    for (const attribute of metaclass.attributes) {
      //if no table attribute...
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to class_instance
        this.createAttributeInstance(
          attribute,
          null as any,
          class_instance.uuid,
          // if there is a default value in the attribute type, we evaluate the expression in the attribute type
          attribute.default_value ? attribute.default_value : "not defined",
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
        );
      } else {
        this.createAttributeInstance(attribute, null as any, class_instance.uuid, "", null as any, null as any, null as any, null as any, null as any, null as any);
      }
    }

    //for ports in metamodel for this class create an instance of the port
    for (const port of metaclass.ports) {
      //call function to instantiate port and add to class_instance
      const portInstance = await this.createPortInstance(this.create_UUID(), port.uuid, class_instance, null as any);

      portInstance.name = port.name;
    }

    this.globalObjectInstance.current_port_instance = null as any;

    //return instance
    return class_instance;
  }

  //-------------------------------------------------
  // create_relationclass_instance
  //-------------------------------------------------

  async createRelationclassInstance(uuid: UUID, x: number, y: number, z: number, relationclassUUID: string, type?: string) {
    //get the metaclass for the relationclass to create
    const metaclass = (await this.metaUtility.getMetaRelationclass(relationclassUUID)) as Relationclass;

    //------------------------------------
    // create relationclass Instance with values from relationClassObject
    //------------------------------------

    this.logger.log("create instance of RelationClass", "info");
    const relation_metaclass = metaclass as Relationclass;

    //create uuid and class_instance
    const relationclass_instance = new RelationclassInstance(uuid, relationclassUUID, undefined as any, undefined as any);

    //push to log file
    this.logger.log("Relationclass Instance " + relationclass_instance.uuid + " created", "done");

    relationclass_instance.uuid_relationclass_bendpoint = relation_metaclass.bendpoint;

    relationclass_instance.name = relation_metaclass.name;
    relationclass_instance.coordinates_2d = { x, y, z };

    //add relationclass_instance to scene_instance
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const relationclass_instances: RelationclassInstance[] = sceneInstance.relationclasses_instances;
    relationclass_instances.push(relationclass_instance);
    sceneInstance.relationclasses_instances = relationclass_instances;

    this.logger.log("Relationclass Instance " + relationclass_instance.uuid + " added to scene_instance " + sceneInstance.uuid, "done");

    // Notify listeners (e.g., SimulationWindow) that the active SceneInstance has changed.
    this.eventAggregator.publish("sceneInstanceMutated", {
      sceneInstanceUuid: sceneInstance.uuid,
      action: "added",
      kind: "relation",
      instanceUuid: relationclass_instance.uuid,
    });

    //set current class_instance in global object
    this.globalObjectInstance.current_class_instance = relationclass_instance;

    //for each attribute in metamodel for this relationclass create an instance of the attribute
    for (const attribute of relation_metaclass.attributes) {
      //call function to instantiate attribute and add to class_instance
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to class_instance
        this.createAttributeInstance(attribute, null as any, relationclass_instance.uuid, attribute.default_value ? attribute.default_value : "not defined", null as any, null as any, null as any, null as any, null as any, null as any);
      } else {
        this.createAttributeInstance(attribute, null as any, relationclass_instance.uuid, "", null as any, null as any, null as any, null as any, null as any, null as any);
      }
    }

    //return instance
    return relationclass_instance;
  }

  addPointToClassInstance(relationclass_instance: RelationclassInstance, object: THREE.Object3D) {
    const worldPosition: THREE.Vector3 = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    const linePoint = {
      UUID: object.uuid,
      Point: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    };
    relationclass_instance.line_points.push(linePoint);
  }

  //-------------------------------------------------
  // create_line_instances
  //-------------------------------------------------
  addLinePoint(line: Line2 | null, point: THREE.Vector3, object: THREE.Mesh) {
    let bendpoint: THREE.Mesh | undefined;
    if (line) {
      // create Bendpoint and insert to scene
      this.logger.log("create Bendpoint", "info");

      bendpoint = object;
      line.userData.relObj.pop();
      line.userData.relObj.push(bendpoint);
      line.userData.relObj.push(this.globalObjectInstance.mousePointer3d);

      // set additional State information
      // this ensures, that we know the actual Object (line) for next bendpoint
      this.globalStateObject.setActiveStateLine(line);
    }

    return bendpoint;
  }

  // finish line and connect to 2. object
  addLastLinePoint(line: Line2, lastObject: THREE.Object3D) {
    const lineGeometry = line.geometry;
    const linePointArray = lineGeometry.attributes.position.array;

    // if line is direct between two objects, add bendpoint  (not active at the moment)
    if (linePointArray[3] === linePointArray[6]) {
      // direct connection between two objects
    }

    // this is the point (Objects) position
    line.userData.relObj.pop();
    line.userData.relObj.push(lastObject);
  }

  //-------------------------------------------------
  // port_instance
  //-------------------------------------------------
  async createPortInstance(uuid: UUID, metaPortUUID: UUID, class_instance: ClassInstance, scene_instance: SceneInstance) {
    let class_instance_uuid: UUID | undefined = undefined;
    let scene_instance_uuid: UUID | undefined = undefined;

    if (class_instance) {
      class_instance_uuid = class_instance.uuid;
    }

    if (scene_instance) {
      scene_instance_uuid = scene_instance.uuid;
    }

    const port_instance = new PortInstance(uuid, metaPortUUID, class_instance_uuid, scene_instance_uuid, []);

    this.globalObjectInstance.current_port_instance = port_instance;
    class_instance ? class_instance.port_instance.push(port_instance) : undefined;
    scene_instance ? scene_instance.port_instances.push(port_instance) : undefined;

    //push to log file
    this.logger.log("Port Instance " + port_instance.name + " created", "done");

    // get metaPort
    const meta_port = await this.metaUtility.getMetaPort(port_instance.uuid_port);

    //for each attribute in metamodel for this port create an instance of the attribute
    for (const attribute of meta_port!.attributes) {
      //if no table attribute...
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to port_instance
        this.createAttributeInstance(
          attribute,
          null as any,
          null as any,
          // if there is a default value in the attribute type, we evaluate the expression in the attribute type
          attribute.default_value ? attribute.default_value : "not defined",
          port_instance.uuid,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
        );
      } else {
        this.createAttributeInstance(attribute, null as any, null as any, "", port_instance.uuid, null as any, null as any, null as any, null as any, null as any);
      }
    }

    return port_instance;
  }

  //-------------------------------------------------
  // role_instance
  //-------------------------------------------------
  async createRoleInstance(role_instance_uuid: UUID, uuid_has_reference_class_instance: ClassInstance, uuid_has_reference_port_instance: PortInstance, from_or_to: string, uuid_relationclass: UUID, role_instance_name?: string, reference_attribute_role?: UUID) {
    let selectedRelationClassUUID: string | null = null;
    let selectedRelationClass: Relationclass | null | undefined = null;
    let role_from: any = null;
    let role_to: any = null;
    //only do that if assigned to classInstance or PortInstance
    if (from_or_to == "from" || from_or_to == "to") {
      selectedRelationClassUUID = this.globalRelationclassObject.getSelectedRelationClassUUID();
      selectedRelationClass = await this.metaUtility.getMetaRelationclass(selectedRelationClassUUID);
      //for relationclasses we need to get the role from the relationclass
      role_from = selectedRelationClass!.role_from;
      role_to = selectedRelationClass!.role_to;
    }

    let uuid_meta_role: any = null;

    if (from_or_to == "from") {
      uuid_meta_role = role_from.uuid;
    } else if (from_or_to == "to") {
      uuid_meta_role = role_to.uuid;
      // if the roleInstance belongs to a reference attribute we need to get the role from the constructor -->
    } else if (from_or_to == "attribute_reference") {
      uuid_meta_role = reference_attribute_role;
    }

    let class_instance_uuid: UUID | undefined;
    let port_instance_uuid: UUID | undefined;

    if (uuid_has_reference_class_instance) {
      class_instance_uuid = uuid_has_reference_class_instance.uuid;
    }

    if (uuid_has_reference_port_instance) {
      port_instance_uuid = uuid_has_reference_port_instance.uuid;
    }

    const role_instance: RoleInstance = new RoleInstance(
      role_instance_uuid,
      uuid_meta_role,
      uuid_relationclass, // will be deleted
      null as any, // will be deleted
      class_instance_uuid,
      port_instance_uuid,
      null as any,
      null as any,
      null as any,
    );

    //push to log file
    this.logger.log("Role Instance " + role_instance.uuid + " created", "done");

    // add role instance to global object array role_instances[]
    this.globalObjectInstance.role_instances.push(role_instance);
    this.logger.log("Role Instance " + role_instance.uuid + " added to globalObject.role_instances", "done");

    //return role_instance
    return role_instance;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const instanceCreationHandler = new InstanceCreationHandler();
