import { SceneType } from "@gds/models/meta/Metamodel_scenetypes.structure";
import { Metamodel } from "@gds/models/meta/Metamodel_metamodels.structure";
import { Attribute } from "@gds/models/meta/Metamodel_attributes.structure";
import { Procedure } from "@gds/models/meta/Metamodel_procedure.structure";
import { UUID } from "@gds/models/meta/Metamodel_metaobjects.structure";
import { SceneInstance } from "@gds/models/instance/Instance_scenes.structure";
import { ClassInstance } from "@gds/models/instance/Instance_classes.structure";
import { RelationclassInstance } from "@gds/models/instance/Instance_relationclasses.structure";
import { AttributeInstance } from "@gds/models/instance/Instance_attributes.structure";
import { apiFetch, ApiError } from "./api";
import { getToken } from "./token";
import { useLogStore } from "@/resources/store/logStore";

const log = (value: string, status: string) => useLogStore.getState().log(value, status);

/** Shape returned by GET /instances/sceneInstances/:uuid/access (fetchHelper:7815). */
export interface AccessEntry {
  uuid_user: string;
  username: string;
  displayname: string;
  read_access: boolean;
  edit_access: boolean;
  delete_access: boolean;
}

/** Bearer auth header used by every authenticated call (old code: "Bearer " + globalObject.accessToken). */
function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${getToken() ?? ""}` };
}

/**
 * REST client for the modeling client. Replaces the 7,889-line generated
 * fetchHelper.ts with just the ~25 endpoints actually called (plan.md §6),
 * ported method-by-method from the old file (URL + method + body verbatim).
 *
 * The modeling client relies on `instanceof` checks (expression_utility), so
 * every response is REVIVED into a real gds class instance via `X.fromJS(...)`
 * (= plainToInstance) before it is returned. Callers get live gds objects, not
 * plain JSON. Errors are logged to the logStore (snackbar on error) and the call
 * resolves to `undefined` / `[]`, mirroring how the old views defended each call.
 *
 * Data stores for scene instances / tab contexts arrive in P3; until then these
 * methods only fetch-revive-return (no store side effects).
 */
export class BackendService {
  // --- Auth -----------------------------------------------------------------

  /** POST /login/signin -> JWT string (fetchHelper.loginPost:59). */
  async login(username: string, password: string): Promise<string | undefined> {
    const response = await apiFetch("login/signin", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }
    const text = await response.text();
    // Server returns the bare token (JSON-encoded string).
    return text === "" ? undefined : JSON.parse(text);
  }

  // --- Metamodel ------------------------------------------------------------

  /** GET /metamodel/sceneTypes -> SceneType[] (fetchHelper.getSceneTypes:99). */
  async getSceneTypes(): Promise<SceneType[]> {
    try {
      const response = await apiFetch("metamodel/sceneTypes", {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to get scene types (${response.status})`);
      const data = await response.json();
      // Server wraps scene types in a Metamodel-shaped payload; revive it and
      // return the SceneType instances (plainToInstance via Metamodel's @Type).
      const metamodel = Metamodel.fromJS(data);
      return metamodel.sceneTypes ?? [];
    } catch (error) {
      log(`Error getting scene types: ${error}`, "error");
      return [];
    }
  }

  /** GET /metamodel/attributes/:uuid -> Attribute (fetchHelper.attributesGET:3900). */
  async attributesGET(attributesUUID: string): Promise<Attribute | undefined> {
    try {
      const response = await apiFetch(
        `metamodel/attributes/${encodeURIComponent(attributesUUID)}`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get attribute (${response.status})`);
      return Attribute.fromJS(await response.json()) as Attribute;
    } catch (error) {
      log(`Error getting attribute: ${error}`, "error");
    }
  }

  /**
   * GET /metamodel/independent_procedures -> Procedure[] (fetchHelper.getProcedures:4403).
   *
   * P3 FIX: the generated fetchHelper mistyped this `Promise<Procedure>`, but at
   * runtime `processGetProcedures` does `Procedure.fromJS(parsedBody)` where the body
   * is an ARRAY (`/independent_procedures` is plural) — so `plainToInstance` returns a
   * `Procedure[]`. The only consumer, `procedure-utility.getGeneralProcedures`, does
   * `Array.isArray(response).map(...)`, i.e. it expects an array. P1 ported the wrong
   * (single) shape; corrected here to match the server + consumer. Non-array bodies
   * yield `[]`, exactly like the old code's `Array.isArray` guard did.
   */
  async getProcedures(): Promise<Procedure[]> {
    try {
      const response = await apiFetch("metamodel/independent_procedures", {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to get procedures (${response.status})`);
      const data = await response.json();
      return Array.isArray(data) ? data.map((item) => Procedure.fromJS(item) as Procedure) : [];
    } catch (error) {
      log(`Error getting procedures: ${error}`, "error");
      return [];
    }
  }

  /** GET /metamodel/sceneTypes/:uuid/procedures -> Procedure[] (fetchHelper.getAssignedProcedures:4421). */
  async getAssignedProcedures(sceneTypeUuid: string): Promise<Procedure[]> {
    try {
      const response = await apiFetch(
        `metamodel/sceneTypes/${encodeURIComponent(sceneTypeUuid)}/procedures`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get assigned procedures (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => Procedure.fromJS(item) as Procedure)
        : [];
    } catch (error) {
      log(`Error getting assigned procedures: ${error}`, "error");
      return [];
    }
  }

  // --- Scene instances ------------------------------------------------------

  /** GET /instances/sceneTypes/:uuid/sceneInstances -> SceneInstance[] (fetchHelper.sceneInstancesAllGET:4508). */
  async sceneInstancesAllGET(sceneTypeUUID: string): Promise<SceneInstance[]> {
    try {
      const response = await apiFetch(
        `instances/sceneTypes/${encodeURIComponent(sceneTypeUUID)}/sceneInstances`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get scene instances (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => SceneInstance.fromJS(item) as SceneInstance)
        : [];
    } catch (error) {
      log(`Error getting scene instances: ${error}`, "error");
      return [];
    }
  }

  /** GET /instances/sceneInstances/:uuid -> SceneInstance (fetchHelper.sceneInstancesGET:4666). */
  async sceneInstancesGET(sceneInstanceUUID: string): Promise<SceneInstance | undefined> {
    try {
      const response = await apiFetch(
        `instances/sceneInstances/${encodeURIComponent(sceneInstanceUUID)}`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get scene instance (${response.status})`);
      return SceneInstance.fromJS(await response.json()) as SceneInstance;
    } catch (error) {
      log(`Error getting scene instance: ${error}`, "error");
    }
  }

  /** POST /instances/sceneTypes/:uuid/sceneInstances -> SceneInstance (fetchHelper.sceneInstancesPOST:4560). */
  async sceneInstancesPOST(
    sceneTypeUUID: string,
    body: SceneInstance,
  ): Promise<SceneInstance | undefined> {
    try {
      const response = await apiFetch(
        `instances/sceneTypes/${encodeURIComponent(sceneTypeUUID)}/sceneInstances`,
        { method: "POST", headers: authHeaders(), body: JSON.stringify(body) },
      );
      if (!response.ok) throw new Error(`Failed to create scene instance (${response.status})`);
      return SceneInstance.fromJS(await response.json()) as SceneInstance;
    } catch (error) {
      log(`Error creating scene instance: ${error}`, "error");
    }
  }

  /** PATCH /instances/sceneInstances/:uuid -> SceneInstance (fetchHelper.sceneInstancesPATCH:4711). */
  async sceneInstancesPATCH(
    sceneInstanceUUID: string,
    body: SceneInstance,
  ): Promise<SceneInstance | undefined> {
    try {
      const response = await apiFetch(
        `instances/sceneInstances/${encodeURIComponent(sceneInstanceUUID)}`,
        { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) },
      );
      if (!response.ok) throw new Error(`Failed to update scene instance (${response.status})`);
      return SceneInstance.fromJS(await response.json()) as SceneInstance;
    } catch (error) {
      log(`Error updating scene instance: ${error}`, "error");
    }
  }

  /** DELETE /instances/sceneInstances/:uuid -> SceneInstance[] (fetchHelper.sceneInstancesAllDELETE2:4759). */
  async sceneInstancesAllDELETE2(sceneInstanceUUID: string): Promise<SceneInstance[]> {
    try {
      const response = await apiFetch(
        `instances/sceneInstances/${encodeURIComponent(sceneInstanceUUID)}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to delete scene instance (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => SceneInstance.fromJS(item) as SceneInstance)
        : [];
    } catch (error) {
      log(`Error deleting scene instance: ${error}`, "error");
      return [];
    }
  }

  // --- Class / relationclass / bendpoint instances --------------------------

  /** DELETE /instances/classesInstances/:uuid -> ClassInstance[] (fetchHelper.classesInstancesAllDELETE2:5117). */
  async classesInstancesAllDELETE2(classInstanceUUID: string): Promise<ClassInstance[]> {
    try {
      const response = await apiFetch(
        `instances/classesInstances/${encodeURIComponent(classInstanceUUID)}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to delete class instance (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => ClassInstance.fromJS(item) as ClassInstance)
        : [];
    } catch (error) {
      log(`Error deleting class instance: ${error}`, "error");
      return [];
    }
  }

  /** DELETE /instances/relationClassesInstances/:uuid -> RelationclassInstance[] (fetchHelper.relationClassesInstancesAllDELETE2:6191). */
  async relationClassesInstancesAllDELETE2(
    relClassesUUID: string,
  ): Promise<RelationclassInstance[]> {
    try {
      const response = await apiFetch(
        `instances/relationClassesInstances/${encodeURIComponent(relClassesUUID)}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to delete relation instance (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => RelationclassInstance.fromJS(item) as RelationclassInstance)
        : [];
    } catch (error) {
      log(`Error deleting relation instance: ${error}`, "error");
      return [];
    }
  }

  /** DELETE /instances/bendpointsInstances/:uuid -> ClassInstance[] (fetchHelper.bendpointInstanceDELETE:7598). */
  async bendpointInstanceDELETE(uuid: string): Promise<ClassInstance[]> {
    try {
      const response = await apiFetch(
        `instances/bendpointsInstances/${encodeURIComponent(uuid)}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to delete bendpoint (${response.status})`);
      const data = await response.json();
      return Array.isArray(data)
        ? data.map((item) => ClassInstance.fromJS(item) as ClassInstance)
        : [];
    } catch (error) {
      log(`Error deleting bendpoint: ${error}`, "error");
      return [];
    }
  }

  // --- Attribute instances --------------------------------------------------

  /** PATCH /instances/attributesInstances/:uuid -> AttributeInstance (fetchHelper.attributeInstancesPATCH:7217). */
  async attributeInstancesPATCH(
    attributeUUID: string,
    body: AttributeInstance,
  ): Promise<AttributeInstance | undefined> {
    try {
      const response = await apiFetch(
        `instances/attributesInstances/${encodeURIComponent(attributeUUID)}`,
        { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) },
      );
      if (!response.ok) throw new Error(`Failed to update attribute instance (${response.status})`);
      return AttributeInstance.fromJS(await response.json()) as AttributeInstance;
    } catch (error) {
      log(`Error updating attribute instance: ${error}`, "error");
    }
  }

  // --- Files ----------------------------------------------------------------
  // Files are handled as raw JSON metadata / browser Blobs, not gds classes
  // (the old fetchHelper returns parsed JSON and browser File objects here).

  /** GET /metamodel/files -> file metadata array (fetchHelper.getFiles:7418). */
  async getFiles(): Promise<unknown[]> {
    try {
      const response = await apiFetch("metamodel/files", {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to get files (${response.status})`);
      return await response.json();
    } catch (error) {
      log(`Error getting files: ${error}`, "error");
      return [];
    }
  }

  /** GET /metamodel/files/:uuid -> browser File (fetchHelper.getFileByUUID:7438). */
  async getFileByUUID(uuid: UUID): Promise<globalThis.File | undefined> {
    try {
      const response = await apiFetch(`metamodel/files/${encodeURIComponent(uuid)}`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to get file (${response.status})`);
      const blob = await response.blob();
      return new globalThis.File([blob], uuid, { type: blob.type });
    } catch (error) {
      log(`Error getting file: ${error}`, "error");
    }
  }

  /** POST /metamodel/files (multipart) -> created file JSON (fetchHelper.postFile:7460). */
  async postFile(
    file: globalThis.File,
    compress = false,
    targetWidth?: number,
    quality?: number,
  ): Promise<unknown> {
    try {
      let path = "metamodel/files";
      if (compress) {
        const params = new URLSearchParams({
          compress: String(compress),
          targetWidth: String(targetWidth),
          quality: String(quality),
        });
        path += `?${params.toString()}`;
      }
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch(path, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      if (!response.ok) throw new Error(`Failed to post file (${response.status})`);
      return await response.json();
    } catch (error) {
      log(`Error posting file: ${error}`, "error");
    }
  }

  /**
   * PATCH /metamodel/files/:uuid (multipart) -> updated file JSON
   * (fetchHelper.patchFileByUUID:7492).
   *
   * P8 FIX: the generated fetchHelper types this `Promise<string>`, and P1 copied that
   * type. It is wrong the same way `getProcedures` was (P3): the body is
   * `JSON.parse(responseText)` of a file OBJECT, and the only consumer — the upload
   * dialog — reads `response.uuid` off it. Verified against the live server in
   * p8-file-upload.integration.test.ts (PATCH returns `{ uuid, ... }`). Typed
   * `Promise<unknown>` to match `postFile`, which the dialog treats identically.
   */
  async patchFileByUUID(
    uuid: UUID,
    file: globalThis.File,
    compress = false,
    targetWidth?: number,
    quality?: number,
  ): Promise<unknown> {
    try {
      let path = `metamodel/files/${encodeURIComponent(uuid)}`;
      if (compress) {
        const params = new URLSearchParams({
          compress: String(compress),
          targetWidth: String(targetWidth),
          quality: String(quality),
        });
        path += `?${params.toString()}`;
      }
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch(path, {
        method: "PATCH",
        headers: authHeaders(),
        body: formData,
      });
      if (!response.ok) throw new Error(`Failed to patch file (${response.status})`);
      return await response.json();
    } catch (error) {
      log(`Error patching file: ${error}`, "error");
    }
  }

  /** DELETE /metamodel/files/:uuid (fetchHelper.deleteFileByUUID:7526). */
  async deleteFileByUUID(uuid: UUID): Promise<void> {
    try {
      const response = await apiFetch(`metamodel/files/${encodeURIComponent(uuid)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to delete file (${response.status})`);
    } catch (error) {
      log(`Error deleting file: ${error}`, "error");
    }
  }

  // --- Scene access (collaboration) -----------------------------------------

  /** GET /instances/sceneInstances/:uuid/access -> AccessEntry[] (fetchHelper.sceneAccessListGET:7649). */
  async sceneAccessListGET(sceneInstanceUuid: string): Promise<AccessEntry[]> {
    try {
      const response = await apiFetch(
        `instances/sceneInstances/${encodeURIComponent(sceneInstanceUuid)}/access`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get access list (${response.status})`);
      const text = await response.text();
      return text === "" ? [] : (JSON.parse(text) as AccessEntry[]);
    } catch (error) {
      log(`Error getting access list: ${error}`, "error");
      return [];
    }
  }

  /** GET /instances/sceneInstances/:uuid/access/me -> caller access level (fetchHelper.sceneAccessMeGET:7677). */
  async sceneAccessMeGET(
    sceneInstanceUuid: string,
  ): Promise<{ level: "read" | "edit" | "delete" | null }> {
    try {
      const response = await apiFetch(
        `instances/sceneInstances/${encodeURIComponent(sceneInstanceUuid)}/access/me`,
        { method: "GET", headers: authHeaders() },
      );
      if (!response.ok) throw new Error(`Failed to get access level (${response.status})`);
      const text = await response.text();
      return text === ""
        ? { level: null }
        : (JSON.parse(text) as { level: "read" | "edit" | "delete" | null });
    } catch (error) {
      log(`Error getting access level: ${error}`, "error");
      return { level: null };
    }
  }

  /**
   * POST /instances/sceneInstances/:uuid/access -> AccessEntry (fetchHelper.sceneAccessPOST:7705).
   * THROWS ApiError instead of swallowing — the share dialog branches on 404/409. See ApiError.
   */
  async sceneAccessPOST(
    sceneInstanceUuid: string,
    body: { uuid_user: string; access: string },
  ): Promise<AccessEntry> {
    const response = await apiFetch(
      `instances/sceneInstances/${encodeURIComponent(sceneInstanceUuid)}/access`,
      { method: "POST", headers: authHeaders(), body: JSON.stringify(body) },
    );
    // No log(..., 'error') here: throwing hands the failure to the caller, which
    // renders its own message. Logging would ALSO pop the error snackbar (logStore),
    // and a 409 "last delete owner" is an expected outcome, not an app-level error.
    if (!response.ok) throw new ApiError(`Failed to grant access (${response.status})`, response.status);
    return (await response.json()) as AccessEntry;
  }

  /**
   * DELETE /instances/sceneInstances/:uuid/access/:userUuid (fetchHelper.sceneAccessDELETE:7761).
   * THROWS ApiError instead of swallowing — the share dialog branches on 409. See ApiError.
   */
  async sceneAccessDELETE(sceneInstanceUuid: string, userUuid: string): Promise<void> {
    const response = await apiFetch(
      `instances/sceneInstances/${encodeURIComponent(sceneInstanceUuid)}/access/${encodeURIComponent(userUuid)}`,
      { method: "DELETE", headers: authHeaders() },
    );
    // Not logged as an error — see sceneAccessPOST.
    if (!response.ok) throw new ApiError(`Failed to revoke access (${response.status})`, response.status);
  }

  /**
   * GET /users/byUsername/:username -> user (fetchHelper.userByUsernameGET:7787).
   * THROWS ApiError instead of swallowing — the share dialog turns a 404 into
   * "User not found". Verified live: an unknown username really does return 404.
   */
  async userByUsernameGET(username: string): Promise<{ uuid: string; username: string; displayname: string }> {
    const response = await apiFetch(`users/byUsername/${encodeURIComponent(username)}`, {
      method: "GET",
      headers: authHeaders(),
    });
    // Not logged as an error — see sceneAccessPOST. A 404 here is just a typo'd
    // username, which the share dialog reports inline as "User not found".
    if (!response.ok) throw new ApiError(`Failed to look up user (${response.status})`, response.status);
    return (await response.json()) as {
      uuid: string;
      username: string;
      displayname: string;
    };
  }
}

// Singleton instance (replaces the Aurelia @newInstanceOf/DI registration).
export const backendService = new BackendService();
