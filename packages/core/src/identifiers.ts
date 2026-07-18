export type Brand<TValue, TName extends string> = TValue & {
  readonly __brand: TName;
};

export type FrameId = Brand<string, "FrameId">;
export type EntityId = Brand<string, "EntityId">;
export type AssetId = Brand<string, "AssetId">;
export type LayerId = Brand<string, "LayerId">;
export type ClockId = Brand<string, "ClockId">;

export class IdentifierValidationError extends TypeError {
  override readonly name: string = "IdentifierValidationError";

  constructor(
    readonly identifierKind: string,
    readonly value: unknown,
    message: string,
  ) {
    super(`${identifierKind}: ${message}`);
  }
}

type IdentifierName = "FrameId" | "EntityId" | "AssetId" | "LayerId" | "ClockId";

function identifier<TName extends IdentifierName>(
  value: unknown,
  identifierKind: TName,
): Brand<string, TName> {
  if (typeof value !== "string") {
    throw new IdentifierValidationError(identifierKind, value, "expected a string");
  }
  if (value.trim().length === 0) {
    throw new IdentifierValidationError(
      identifierKind,
      value,
      "must not be empty or whitespace-only",
    );
  }
  if (/\p{Cc}/u.exec(value) !== null) {
    throw new IdentifierValidationError(
      identifierKind,
      value,
      "must not contain control characters",
    );
  }
  return value as Brand<string, TName>;
}

export const frameId = (value: string): FrameId => identifier(value, "FrameId");

export const entityId = (value: string): EntityId => identifier(value, "EntityId");

export const assetId = (value: string): AssetId => identifier(value, "AssetId");

export const layerId = (value: string): LayerId => identifier(value, "LayerId");

export const clockId = (value: string): ClockId => identifier(value, "ClockId");

export function assertValidFrameId(value: FrameId): void {
  identifier(value, "FrameId");
}

export function assertValidEntityId(value: EntityId): void {
  identifier(value, "EntityId");
}

export function assertValidAssetId(value: AssetId): void {
  identifier(value, "AssetId");
}

export function assertValidLayerId(value: LayerId): void {
  identifier(value, "LayerId");
}

export function assertValidClockId(value: ClockId): void {
  identifier(value, "ClockId");
}
