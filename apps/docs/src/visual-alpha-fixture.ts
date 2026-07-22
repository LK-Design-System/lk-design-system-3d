import { entityId, quaternionFromYaw, type EntityId, type Quat, type Vec3 } from "@lk-robotics/lds-3d-core";
import type { SelectedAssetDetails } from "./visual-alpha-ui.js";

export type VisualEntityStatus = "live" | "stale" | "warning" | "error" | "idle";

export interface VisualFixtureEntity {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: "AMR" | "랙" | "팔레트" | "화물" | "충전 스테이션" | "안전 콘";
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
    task: "P-204를 도크 03으로 운반",
  }),
  fixtureEntity("robot/amr-02", "AMR 02", "AMR", "amr", [0.4, 2.15, 0], -0.72, "stale", {
    battery: 46,
    task: "재고 순회 · 업데이트 지연",
  }),
  fixtureEntity("robot/amr-03", "AMR 03", "AMR", "amr", [3.9, -3.25, 0], 1.35, "error", {
    battery: 18,
    task: "차단됨 · 장애물 감지",
  }),
  fixtureEntity("rack/r-01", "랙 R-01", "랙", "rack", [-2.5, 4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-02", "랙 R-02", "랙", "rack", [2.0, 4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-03", "랙 R-03", "랙", "rack", [-2.5, -4.25, 0], 0, "idle"),
  fixtureEntity("rack/r-04", "랙 R-04", "랙", "rack", [2.0, -4.25, 0], 0, "idle"),
  fixtureEntity("pallet/p-204", "팔레트 P-204", "팔레트", "pallet", [-0.5, 3.25, 0], 0, "idle"),
  fixtureEntity("pallet/p-119", "팔레트 P-119", "팔레트", "pallet", [3.2, 3.4, 0], 0, "idle"),
  fixtureEntity("cargo/c-17", "화물 C-17", "화물", "cargoBin", [-0.9, -3.35, 0], 0.2, "warning"),
  fixtureEntity("dock/d-03", "충전 도크 03", "충전 스테이션", "chargingStation", [7.35, 0.2, 0], Math.PI, "live"),
  fixtureEntity("safety/cone-01", "안전 콘 01", "안전 콘", "safetyCone", [3.9, -2.35, 0], 0, "warning"),
  fixtureEntity("safety/cone-02", "안전 콘 02", "안전 콘", "safetyCone", [5.15, -2.35, 0], 0, "warning"),
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
          name: "도크 03 목표",
          kind: "목표",
          status: "live",
          pose: ACTIVE_GOAL_POSITION,
          task: "AMR 01 목적지 · 유효",
          source: "visual-alpha/goal-state",
          frame: "lk-map",
          timestamp: "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ] as const,
      [
        "goal/invalid-preview",
        {
          id: "goal/invalid-preview",
          name: "유효하지 않은 목표 미리보기",
          kind: "목표",
          status: "error",
          pose: INVALID_GOAL_POSITION,
          task: "거부됨 · 장애물 안전거리",
          source: "visual-alpha/goal-state",
          frame: "lk-map",
          timestamp: "T−0.08 s",
        } satisfies SelectedAssetDetails,
      ] as const,
      ...([
        ["path/amr-01/actual", "실제 경로", "idle", VISUAL_ALPHA_PATHS.actual],
        ["path/amr-01/executing", "실행 중 경로", "live", VISUAL_ALPHA_PATHS.executing],
        ["path/amr-01/planned", "계획 경로", "warning", VISUAL_ALPHA_PATHS.planned],
        ["path/amr-03/blocked", "차단된 경로", "error", VISUAL_ALPHA_PATHS.blocked],
      ] as const).map(([id, name, status, points]): readonly [string, SelectedAssetDetails] => [
        id,
        {
          id,
          name,
          kind: "경로",
          status,
          pose: points[0] ?? [0, 0, 0],
          task: `경유점 ${String(points.length)}개`,
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
