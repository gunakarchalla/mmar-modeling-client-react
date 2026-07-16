import { Relationclass, ClassInstance, PortInstance, RoleInstance, Role } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { logger } from "@/resources/services/logger";

/**
 * P5 port of the old `resources/consistency_checker.ts` (DI-stripping recipe):
 * GlobalDefinition / Logger injections become module-singleton imports. Bodies are
 * faithful to the original.
 *
 * NOTIFLIX -> logStore (plan §3.3, LOCKED): the original popped a
 * `Notiflix.Notify.failure(...)` toast on a disallowed action. notiflix is not
 * installed; the equivalent is `logger.log(msg, "error")`, which the P1 logger
 * routes to the MUI AppSnackbar (snackbar fires only on status "error"). The
 * original's parallel `logger.log(msg, "close")` calls are kept as-is (log only).
 */
export class ConsistencyChecker {
  private globalObjectInstance = globalObject;
  private logger = logger;

  checkStartPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
    const role_from = relationclass.role_from;
    let allowed_class_reference;
    let allowed_port_reference;
    let allowed = true;

    //if classInstance provided
    if (classInstance) {
      allowed_class_reference = role_from.class_references.find((class_reference) => class_reference.uuid == classInstance.uuid_class);
      if (allowed_class_reference) allowed = this.countSameRelationsOnClassInstance(this.globalObjectInstance.role_instances, role_from, relationclass, classInstance, allowed_class_reference.min, allowed_class_reference.max);
    }

    //if portInstance provided
    if (portInstance) {
      allowed_port_reference = role_from.port_references.find((port_reference) => port_reference.uuid == portInstance.uuid_port);
      if (allowed_port_reference) allowed = this.countSameRelationsOnPortInstance(this.globalObjectInstance.role_instances, role_from, relationclass, portInstance, allowed_port_reference.min, allowed_port_reference.max);
    }

    if (!allowed_class_reference && !allowed_port_reference) {
      allowed = false;
      // notiflix -> snackbar via logger "error"
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "error");

      //push to log file
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "close");

      return allowed;
    }

    if (!allowed) {
      // notiflix -> snackbar via logger "error"
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "error");
      //push to log file
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "close");
    }
    return allowed;
  }

  checkEndPoint(relationclass: Relationclass, classInstance?: ClassInstance, portInstance?: PortInstance) {
    const role_to = relationclass.role_to;
    let allowed_class_reference;
    let allowed_port_reference;
    let allowed = true;

    //if classInstance provided
    if (classInstance) {
      allowed_class_reference = role_to.class_references.find((class_reference) => class_reference.uuid == classInstance.uuid_class);
      if (allowed_class_reference) allowed = this.countSameRelationsOnClassInstance(this.globalObjectInstance.role_instances, role_to, relationclass, classInstance, allowed_class_reference.min, allowed_class_reference.max);
    }

    //if portInstance provided
    if (portInstance) {
      allowed_port_reference = role_to.port_references.find((port_reference) => port_reference.uuid == portInstance.uuid_port);
      if (allowed_port_reference) allowed = this.countSameRelationsOnPortInstance(this.globalObjectInstance.role_instances, role_to, relationclass, portInstance, allowed_port_reference.min, allowed_port_reference.max);
    }

    if (!allowed_class_reference && !allowed_port_reference) {
      allowed = false;
      // notiflix -> snackbar via logger "error"
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "error");
      //push to log file
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "close");
      return allowed;
    }

    if (!allowed) {
      // notiflix -> snackbar via logger "error"
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "error");
      //push to log file
      this.logger.log("This action is not allowed due to some restirctions in the metamodel!", "close");
    }
    return allowed;
  }

  countSameRelationsOnClassInstance(roleInstances: RoleInstance[], roleToCheck: Role, relationclass: Relationclass, classInstance: ClassInstance, min: number, max: number) {
    const roleInstancesFound = roleInstances.filter(
      (roleInstance) =>
        roleInstance.uuid_role == roleToCheck.uuid &&
        // roleInstance.uuid_relationclass == relationclass.uuid &&
        roleInstance.uuid_has_reference_class_instance == classInstance.uuid,
    );

    // push to log file
    this.logger.log("role consistency check: min is: " + min + " and max is: " + max, "info");

    if ((min <= roleInstancesFound.length + 1 || min == null) && (roleInstancesFound.length + 1 <= max || max == null)) {
      // push to log file
      this.logger.log("role allowed!", "done");

      return true;
    } else {
      // push to log file
      this.logger.log("role not allowed!", "close");

      return false;
    }
  }

  countSameRelationsOnPortInstance(roleInstances: RoleInstance[], roleToCheck: Role, relationclass: Relationclass, portInstance: PortInstance, min: number, max: number) {
    const roleInstancesFound = roleInstances.filter(
      (roleInstance) =>
        roleInstance.uuid_role == roleToCheck.uuid &&
        //roleInstance.uuid_relationclass == relationclass.uuid &&
        roleInstance.uuid_has_reference_port_instance == portInstance.uuid,
    );

    // push to log file
    this.logger.log("role consistency check: min is: " + min + " and max is: " + max, "info");

    if ((min <= roleInstancesFound.length + 1 || min == null) && (roleInstancesFound.length + 1 <= max || max == null)) {
      // push to log file
      this.logger.log("role allowed!", "done");

      return true;
    } else {
      // push to log file
      this.logger.log("role not allowed!", "close");

      return false;
    }
  }
}

// Module singleton (replaces the Aurelia @inject() DI registration).
export const consistencyChecker = new ConsistencyChecker();
