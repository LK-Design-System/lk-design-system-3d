import { entityId, quaternionFromYaw, type EntityId, type Quat, type Vec3 } from "@lk-robotics/design-system-3d-core";
import type { SelectedAssetDetails } from "./visual-alpha-ui.js";

export type VisualEntityStatus = "live" | "stale" | "warning" | "error" | "idle";

export interface VisualFixtureEntity {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: "AMR" | "Rack" | "Pallet" | "Cargo" | "Charging station" | "Safety cone";
  readonly assetKey: "amr" | "rack" | "pallet" | "cargoBin" | "chargingStation" | "safetyCone";
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly status: VisualEntityStatus;
  readonly battery?: number;
  readonly task?: string;
}

function fixtureEntity(
  id: string,
  name: string,
  kind: VisualFixtureEntity["kind"],
  assetKey: VisualFixtureEntity["assetKey"],
  position: Vec3,
  yawRadians: number,
  status: VisualEntityStatus,
  extra: Pick<VisualFixtureEntity, "battery" | "task"> = {},
): VisualFixtureEntity {
  return Object.freeze({
    id: entityId(id),
    name,
    kind,
    assetKey,
    position,
    orientation: quaternionFromYaw(yawRadians),
    status,
    ...extra,
  });
}

/**
 * Shared A/B fixture. Both visual directions use these exact entities, camera
 * targets, paths, and interaction identifiers so the comparison is controlled.
 */
export const VISUAL_ALPHA_ENTITIES: readonly VisualFixtureEntity[] = Object.freeze([
  fixtureEntity("robot/amr-01", "AMR 01", "AMR", "amr", [-4.6, -1.2, 0], 0.08, "live", {
    battery: 82,
    task: "Deliver P-204 to Dock 03",
  }),
  fixtureEntity("robot/amr-02", "AMR 02", "AMR", "amr", [0.4, 2.15, 0], -0.72, "stale", {
    battery: 46,
    task: "Inventory cycle · update delayed",
  }),
  fixtureEntity("robot/amr-03", "AMR 03", "AMR", "amr", [3.9, -3.25, 0], 1.35, "error", {
    battery: 18,
    task: "Blocked · obstacle detected",
  }),
  fixtureEntity("rack/r-01", "Rack R-01", "Rack", "rack", [-2.5, 4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-02", "Rack R-02", "Rack", "rack", [2.0, 4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-03", "Rack R-03", "Rack", "rack", [-2.5, -4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-04", "Rack R-04", "Rack", "rack", [2.0, -4.25, 0], 0, "idle"),
  fixtureEntity("pallet/p-204", "Pallet P-204", "Pallet", "pallet", [-0.5, 3.25, 0], 0, "idle"),
  fixtureEntity("pallet/p-119", "Pallet P-119", "Pallet", "pallet", [3.2, 3.4, 0], 0, "idle"),
  fixtureEntity("cargo/c-17", "Cargo C-17", "Cargo", "cargoBin", [-0.9, -3.35, 0], 0.2, "warning"),
  fixtureEntity("dock/d-03", "Charging Dock 03", "Charging station", "chargingStation", [7.35, 0.2, 0], Math.PI, "live"),
  fixtureEntity("safety/cone-01", "Safety Cone 01", "Safety cone", "safetyCone", [3.9, -2.35, 0], 0, "warning"),
  fixtureEntity("safety/cone-02", "Safety Cone 02", "Safety cone", "safetyCone", [5.15, -2.35, 0], 0, "warning"),
]);

export const PRIMARY_AMR_ID = entityId("robot/amr-01");
export const ERROR_AMR_ID = entityId("robot/amr-03");

export const VISUAL_ALPHA_PATHS = Object.freeze({
  actual: Object.freeze([
    [-7.2, -1.2, 0.035],
    [-6.1, -1.2, 0.035],
    [-4.6, -1.2, 0.035],
  ] satisfies readonly Vec3[]),
  executing: Object.freeze([
    [-4.6, -1.2, 0.045],
    [-2.7, -1.0, 0.045],
    [-0.7, -0.45, 0.045],
    [1.2, 0.35, 0.045],
  ] satisfies readonly Vec3[]),
  planned: Object.freeze([
    [1.2, 0.35, 0.04],
    [3.5, 1.05, 0.04],
    [5.55, 0.8, 0.04],
    [6.8, 0.2, 0.04],
  ] satisfies readonly Vec3[]),
  blocked: Object.freeze([
    [3.9, -3.25, 0.055],
    [4.5, -2.75, 0.055],
    [5.15, -2.35, 0.055],
  ] satisfies readonly Vec3[]),
});

export const ACTIVE_GOAL_POSITION: Vec3 = [6.8, 0.2, 0.04];
export const INVALID_GOAL_POSITION: Vec3 = [4.55, -2.35, 0.04];

export const VISUAL_ALPHA_DETAILS: Readonly<Record<string, SelectedAssetDetails>> = Object.freeze(
  Object.fromEntries<SelectedAssetDetails>(
    [
      ...VISUAL_ALPHA_ENTITIES.map((entity): readonly [string, SelectedAssetDetails] => [
        entity.id,
        {
          id: entity.id,
          name: entity.name,
          kind: entity.kind,
          status:
            entity.status === "error"
              ? "error"
              : entity.status === "warning" || entity.status === "stale"
                ? "warning"
                : entity.status === "live"
                  ? "live"
                  : "idle",
          pose: entity.position,
          ...(entity.battery === undefined ? {} : { battery: entity.battery }),
          ...(entity.task === undefined ? {} : { task: entity.task }),
          source: "visual-alpha/amr-warehouse-v0",
          frame: "lk-map",
          timestamp: entity.status === "stale" ? "T−18.4 s" : "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ]),
      [
        "goal/dock-03",
        {
          id: "goal/dock-03",
          name: "Dock 03 goal",
          kind: "Goal",
          status: "live",
          pose: ACTIVE_GOAL_POSITION,
          task: "AMR 01 destination · valid",
          source: "visual-alpha/goal-state",
          frame: "lk-map",
          timestamp: "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ] as const,
      [
        "goal/invalid-preview",
        {
          id: "goal/invalid-preview",
          name: "Invalid goal preview",
          kind: "Goal",
          status: "error",
          pose: INVALID_GOAL_POSITION,
          task: "Rejected · obstacle clearance",
          source: "visual-alpha/goal-state",
          frame: "lk-map",
          timestamp: "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ] as const,
      ...([
        ["path/amr-01/actual", "Actual path", "idle", VISUAL_ALPHA_PATHS.actual],
        ["path/amr-01/executing", "Executing path", "live", VISUAL_ALPHA_PATHS.executing],
        ["path/amr-01/planned", "Planned path", "warning", VISUAL_ALPHA_PATHS.planned],
        ["path/amr-03/blocked", "Blocked path", "error", VISUAL_ALPHA_PATHS.blocked],
      ] as const).map(([id, name, status, points]): readonly [string, SelectedAssetDetails] => [
        id,
        {
          id,
          name,
          kind: "Path",
          status,
          pose: points[0] ?? [0, 0, 0],
          task: `${String(points.length)} waypoints`,
          source: "visual-alpha/path-state",
          frame: "lk-map",
          timestamp: "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ]),
    ],
  ),
);

export function selectedDetails(id: EntityId | undefined): SelectedAssetDetails | undefined {
  return id === undefined ? undefined : VISUAL_ALPHA_DETAILS[id];
}
