import { describe, expect, it, vi } from "vitest";

import {
  AssetLoadCancelledError,
  AssetOwnershipError,
  consumeAssetOwnershipToken,
  createAssetLoader,
  createLoadedAsset,
  parseAssetManifest,
  type AbortSignalLike,
  type AssetLoadRequest,
  type AssetManifestV1,
} from "../src/index.js";

function manifest(): AssetManifestV1 {
  const parsed = parseAssetManifest({
    schemaVersion: 1,
    assetId: "fixture",
    version: "1",
    kind: "generic",
    format: "glb",
    fileFrame: "file",
    fileCoordinate: {
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    },
    coreFrame: "core",
    fileToCoreTransform: {
      sourceFrame: "file",
      targetFrame: "core",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    boundsInCoreMeters: {
      frame: "core",
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
  });
  if (!parsed.ok) {
    throw new Error("Test manifest must be valid.");
  }
  return parsed.value;
}

function request(): Omit<AssetLoadRequest, "signal"> {
  return Object.freeze({
    manifest: manifest(),
    source: Object.freeze({ kind: "url" as const, url: "/fixture.glb" }),
  });
}

class TestAbortSignal implements AbortSignalLike {
  aborted = false;
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: "abort", listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "abort", listener: () => void): void {
    this.listeners.delete(listener);
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    for (const listener of [...this.listeners]) listener();
  }
}

function captureOwnershipError(action: () => unknown): AssetOwnershipError {
  try {
    action();
  } catch (error) {
    if (error instanceof AssetOwnershipError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected AssetOwnershipError to be thrown.");
}

describe("asset ownership", () => {
  it("rejects duplicate transfer and leaves transferred resource untouched", () => {
    const resource = { id: 1 };
    const dispose = vi.fn();
    const loaded = createLoadedAsset({
      manifest: manifest(),
      request: request(),
      resource,
      disposeResource: dispose,
    });

    loaded.transferOwnership();
    expect(() => loaded.transferOwnership()).toThrowError(AssetOwnershipError);
    loaded.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("rejects duplicate token consumption and disposes the adopter once", () => {
    const resource = { id: 2 };
    const dispose = vi.fn();
    const loaded = createLoadedAsset({
      manifest: manifest(),
      request: request(),
      resource,
      disposeResource: dispose,
    });
    const token = loaded.transferOwnership();
    const adopted = consumeAssetOwnershipToken(token);
    expect(adopted.resource).toBe(resource);
    expect(captureOwnershipError(() => consumeAssetOwnershipToken(token)).code).toBe(
      "ownership_token_already_consumed",
    );

    adopted.dispose();
    adopted.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects forged ownership tokens", () => {
    const forged = {
      __opaque: "AssetOwnershipToken" as const,
      manifest: manifest(),
      request: request(),
    };
    expect(captureOwnershipError(() => consumeAssetOwnershipToken(forged)).code).toBe(
      "invalid_ownership_token",
    );
  });

  it("disposes a non-transferred LoadedAsset once and forbids later transfer", () => {
    const dispose = vi.fn();
    const loaded = createLoadedAsset({
      manifest: manifest(),
      request: request(),
      resource: { id: 3 },
      disposeResource: dispose,
    });
    loaded.dispose();
    loaded.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(captureOwnershipError(() => loaded.transferOwnership()).code).toBe(
      "loaded_asset_already_disposed",
    );
  });
});

describe("createAssetLoader", () => {
  it("reports validated progress and lifecycle states", async () => {
    const states: string[] = [];
    const progress: unknown[] = [];
    const dispose = vi.fn();
    const loader = createAssetLoader((_request, context) => {
      context.reportProgress({ loadedBytes: 4, totalBytes: 8 });
      return { bytes: 8 };
    }, dispose);

    const loaded = await loader.load(request(), {
      onStateChange: (state) => states.push(state),
      onProgress: (value) => progress.push(value),
    });
    expect(states).toEqual(["loading", "ready"]);
    expect(progress).toEqual([{ loadedBytes: 4, totalBytes: 8 }]);
    loaded.dispose();
    expect(states).toEqual(["loading", "ready", "disposed"]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid progress", async () => {
    const loader = createAssetLoader(
      (_request, context) => {
        context.reportProgress({ loadedBytes: 9, totalBytes: 8 });
        return {};
      },
      () => undefined,
    );
    await expect(loader.load(request())).rejects.toBeInstanceOf(RangeError);
  });

  it("cancels an in-flight load and disposes a late resource", async () => {
    const signal = new TestAbortSignal();
    let resolveResource: ((resource: { id: number }) => void) | undefined;
    const deferred = new Promise<{ id: number }>((resolve) => {
      resolveResource = resolve;
    });
    const dispose = vi.fn();
    const states: string[] = [];
    const loader = createAssetLoader(() => deferred, dispose);
    const pending = loader.load(
      { ...request(), signal },
      { onStateChange: (state) => states.push(state) },
    );

    signal.abort();
    await expect(pending).rejects.toBeInstanceOf(AssetLoadCancelledError);
    expect(states).toEqual(["loading", "cancelled"]);

    if (resolveResource === undefined) {
      throw new Error("Deferred resolver was not initialized.");
    }
    resolveResource({ id: 4 });
    await deferred;
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("does not start a pre-cancelled load", async () => {
    const signal = new TestAbortSignal();
    signal.abort();
    const implementation = vi.fn(() => ({}));
    const states: string[] = [];
    const loader = createAssetLoader(implementation, () => undefined);

    await expect(
      loader.load({ ...request(), signal }, { onStateChange: (state) => states.push(state) }),
    ).rejects.toBeInstanceOf(AssetLoadCancelledError);
    expect(implementation).not.toHaveBeenCalled();
    expect(states).toEqual(["cancelled"]);
  });
});
