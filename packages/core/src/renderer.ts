export type RendererLifecycleState =
  | "idle"
  | "initializing"
  | "ready"
  | "paused"
  | "lost"
  | "restoring"
  | "error"
  | "disposed";

export type RendererCapabilityId =
  | "rendering"
  | "picking"
  | "selection"
  | "editing"
  | "point-cloud"
  | "timeline"
  | "webgpu"
  | `extension:${string}`;

export interface RendererCapabilities {
  readonly supported: readonly RendererCapabilityId[];
}

export function hasRendererCapability(
  capabilities: RendererCapabilities,
  capability: RendererCapabilityId,
): boolean {
  return capabilities.supported.includes(capability);
}

export interface RendererStatus {
  readonly state: RendererLifecycleState;
  readonly snapshotUsable: boolean;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
  };
}
