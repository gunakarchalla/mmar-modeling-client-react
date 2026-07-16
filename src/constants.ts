/**
 * Hardcoded UUIDs / sentinel values the modeling client's behaviour depends on.
 *
 * The old client scattered these string literals through the views (attribute-window,
 * dialog-table-attribute, dialog-reference-attribute, simulation-window, the hybrid
 * algorithms). Plan §9 P12 asks for the robotics uuids to be "lifted into a
 * src/constants.ts"; P8 needed four of them first, so the file starts here and P12
 * appends its own (META_JOINT_UUID, ...).
 *
 * These are contracts with the DATABASE, not arbitrary constants: they identify
 * concrete rows of the demo metamodel. Do not "clean them up" or regenerate them.
 */

/**
 * AttributeType "File". Attribute instances whose meta attribute has this type get
 * the upload / delete / download buttons in the attribute window.
 * (attribute-window.ts:122 — `metaAttribute.attribute_type.uuid == "2df15b5e-..."`)
 *
 * NOTE: the demo metamodel on mmar-server currently contains NO attribute of this
 * type (verified in P8 across all 8 scene types), so that branch is unreachable with
 * demo data — the file endpoints themselves are covered by the P8 integration test.
 */
export const FILE_ATTRIBUTE_TYPE_UUID = "2df15b5e-6b43-4911-b38b-0fc5747a8ee6";

/**
 * The meta Attribute "Object 3D" — rendered as a GLTF upload button instead of a
 * text field (attribute-window.html:115). Present on ObjectSpace's Detectable and
 * Augmentation classes in the demo metamodel.
 */
export const OBJECT_3D_ATTRIBUTE_UUID = "b058b3b4-b523-4ffe-b08e-4f8dda2831c8";

/**
 * The meta Attribute "Image to detect" — rendered as an image upload button
 * (attribute-window.html:127). Also on ObjectSpace's Detectable / Augmentation.
 */
export const IMAGE_TO_DETECT_ATTRIBUTE_UUID = "d334dd62-5651-4d0f-a7a0-13718f20da36";

/**
 * The meta Attribute "Name". The reference dialog resolves a referenced instance's
 * display name through this attribute (dialog-reference-attribute.ts:105 etc.).
 */
export const NAME_ATTRIBUTE_UUID = "d6632c72-89fa-4210-9d01-18e911505608";

/**
 * SceneType "Robotic system" — the table dialog runs the robotics hybrid algorithm
 * only for scenes of this type (dialog-table-attribute.ts:240). P12 uses it too.
 */
export const ROBOTIC_SYSTEM_SCENETYPE_UUID = "113c3133-bf77-493a-a36f-553e77832280";

/**
 * Sentinel default values. The old upload buttons flip their label by comparing the
 * attribute value against the meta default ("Upload" vs "Replace"), rather than
 * checking whether real content is present (attribute-window.html:117/129).
 */
export const OBJECT_3D_DEFAULT_VALUE = "3D Object String";
export const IMAGE_DEFAULT_VALUE = "Image";
