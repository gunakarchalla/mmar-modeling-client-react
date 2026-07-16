import { ObjectInstance } from "@gds";
import { metaUtility } from "./meta-utility";
import { expressionUtility } from "./expression-utility";

/**
 * Port of the old modeling `resources/services/simulation_utility.ts` (plan §10: ★).
 * DI stripped: MetaUtility / ExpressionUtility become module-singleton imports.
 * The execution wiring (simulation window sliders) lands in P12; this is only the
 * runner half.
 *
 * Utility class for handling simulations.
 */
export class SimulationUtility {
  private metaUtility = metaUtility;
  private expression = expressionUtility;

  /**
   * Runs a simulation function.
   * @param simulationCode - The code of the simulation function to run.
   * @returns A promise that resolves when the simulation function has finished running.
   */
  async runSimulationFunction(simulationCode: string, instance: ObjectInstance): Promise<void> {
    const simulationFunction = await this.metaUtility.parseMetaFunction(simulationCode);
    await simulationFunction(this.expression, instance);
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const simulationUtility = new SimulationUtility();
