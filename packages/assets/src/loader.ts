import type { AssetManifestV1 } from "./manifest.js";

export type AssetSource =
  | { readonly kind: "url"; readonly url: string }
  | {
      readonly kind: "bytes";
      readonly data: ArrayBuffer;
      readonly mediaType: string;
    };

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface AssetLoadRequest {
  readonly manifest: AssetManifestV1;
  readonly source: AssetSource;
  readonly signal?: AbortSignalLike;
}

export type AssetLoadState = "idle" | "loading" | "ready" | "error" | "cancelled" | "disposed";

export interface AssetLoadProgress {
  readonly loadedBytes: number;
  readonly totalBytes?: number;
}

export interface AssetLoadObserver {
  onStateChange?(state: AssetLoadState): void;
  onProgress?(progress: AssetLoadProgress): void;
}

export interface AssetOwnershipToken<TResource> {
  readonly __opaque: "AssetOwnershipToken";
  readonly __resourceType?: TResource;
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
}

export interface LoadedAsset<TResource> {
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
  transferOwnership(): AssetOwnershipToken<TResource>;
  dispose(): void;
}

export interface AdoptedAsset<TResource> {
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
  readonly resource: TResource;
  dispose(): void;
}

export interface AssetLoader<TResource> {
  load(request: AssetLoadRequest, observer?: AssetLoadObserver): Promise<LoadedAsset<TResource>>;
}

export type AssetOwnershipErrorCode =
  | "loaded_asset_already_transferred"
  | "loaded_asset_already_disposed"
  | "invalid_ownership_token"
  | "ownership_token_already_consumed";

export class AssetOwnershipError extends Error {
  override readonly name = "AssetOwnershipError";

  constructor(
    readonly code: AssetOwnershipErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class AssetLoadCancelledError extends Error {
  override readonly name = "AssetLoadCancelledError";
  readonly code = "asset_load_cancelled" as const;

  constructor(message = "Asset load was cancelled.") {
    super(message);
  }
}

interface TokenState<TResource> {
  consumed: boolean;
  readonly resource: TResource;
  readonly disposeResource: (resource: TResource) => void;
  readonly onDisposed?: () => void;
}

const ownershipTokens = new WeakMap<object, TokenState<unknown>>();

function requestWithoutSignal(request: AssetLoadRequest): Omit<AssetLoadRequest, "signal"> {
  const source: AssetSource =
    request.source.kind === "url"
      ? Object.freeze({ kind: "url", url: request.source.url })
      : Object.freeze({
          kind: "bytes",
          data: request.source.data,
          mediaType: request.source.mediaType,
        });
  return Object.freeze({ manifest: request.manifest, source });
}

export interface CreateLoadedAssetOptions<TResource> {
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
  readonly resource: TResource;
  readonly disposeResource: (resource: TResource) => void;
  readonly onDisposed?: () => void;
}

/**
 * Creates the sole initial owner of a loaded resource. Ownership can either be
 * disposed locally or transferred exactly once through an opaque token.
 */
export function createLoadedAsset<TResource>(
  options: CreateLoadedAssetOptions<TResource>,
): LoadedAsset<TResource> {
  let state: "owned" | "transferred" | "disposed" = "owned";
  const request = Object.freeze(options.request);

  const loadedAsset: LoadedAsset<TResource> = {
    manifest: options.manifest,
    request,
    transferOwnership(): AssetOwnershipToken<TResource> {
      if (state === "transferred") {
        throw new AssetOwnershipError(
          "loaded_asset_already_transferred",
          "LoadedAsset ownership has already been transferred.",
        );
      }
      if (state === "disposed") {
        throw new AssetOwnershipError(
          "loaded_asset_already_disposed",
          "A disposed LoadedAsset cannot transfer ownership.",
        );
      }

      state = "transferred";
      const token: AssetOwnershipToken<TResource> = Object.freeze({
        __opaque: "AssetOwnershipToken",
        manifest: options.manifest,
        request,
      });
      const tokenState: TokenState<TResource> = {
        consumed: false,
        resource: options.resource,
        disposeResource: options.disposeResource,
        ...(options.onDisposed === undefined ? {} : { onDisposed: options.onDisposed }),
      };
      ownershipTokens.set(token, tokenState as TokenState<unknown>);
      return token;
    },
    dispose(): void {
      if (state !== "owned") {
        // Disposal is deliberately idempotent. After transfer it must not touch
        // the resource now owned by the token/adopter.
        return;
      }
      state = "disposed";
      try {
        options.disposeResource(options.resource);
      } finally {
        options.onDisposed?.();
      }
    },
  };
  return Object.freeze(loadedAsset);
}

/**
 * Consumes an opaque ownership token exactly once and returns the new sole
 * owner. Forged tokens and repeated consumption fail at runtime.
 */
export function consumeAssetOwnershipToken<TResource>(
  token: AssetOwnershipToken<TResource>,
): AdoptedAsset<TResource> {
  const tokenState = ownershipTokens.get(token as object) as TokenState<TResource> | undefined;
  if (tokenState === undefined) {
    throw new AssetOwnershipError(
      "invalid_ownership_token",
      "Ownership token was not issued by this package instance.",
    );
  }
  if (tokenState.consumed) {
    throw new AssetOwnershipError(
      "ownership_token_already_consumed",
      "AssetOwnershipToken has already been consumed.",
    );
  }
  tokenState.consumed = true;

  let disposed = false;
  const adopted: AdoptedAsset<TResource> = {
    manifest: token.manifest,
    request: token.request,
    resource: tokenState.resource,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        tokenState.disposeResource(tokenState.resource);
      } finally {
        tokenState.onDisposed?.();
      }
    },
  };
  return Object.freeze(adopted);
}

export interface AssetResourceLoadContext {
  readonly signal?: AbortSignalLike;
  reportProgress(progress: AssetLoadProgress): void;
  throwIfCancelled(): void;
}

export type AssetResourceLoadImplementation<TResource> = (
  request: AssetLoadRequest,
  context: AssetResourceLoadContext,
) => TResource | PromiseLike<TResource>;

function validateProgress(progress: AssetLoadProgress): AssetLoadProgress {
  if (!Number.isFinite(progress.loadedBytes) || progress.loadedBytes < 0) {
    throw new RangeError("loadedBytes must be a finite non-negative number.");
  }
  if (
    progress.totalBytes !== undefined &&
    (!Number.isFinite(progress.totalBytes) ||
      progress.totalBytes < 0 ||
      progress.loadedBytes > progress.totalBytes)
  ) {
    throw new RangeError("totalBytes must be finite, non-negative, and not less than loadedBytes.");
  }
  return Object.freeze(
    progress.totalBytes === undefined
      ? { loadedBytes: progress.loadedBytes }
      : {
          loadedBytes: progress.loadedBytes,
          totalBytes: progress.totalBytes,
        },
  );
}

function disposeLateResource<TResource>(
  disposeResource: (resource: TResource) => void,
  resource: TResource,
): void {
  try {
    disposeResource(resource);
  } catch {
    // A late result arrived after cancellation, so there is no caller left to
    // receive a cleanup exception. The resource is nevertheless attempted once.
  }
}

function isAborted(signal: AbortSignalLike | undefined): boolean {
  // AbortSignal.aborted is readonly to consumers but changes internally. A
  // function boundary prevents TypeScript from treating an earlier read as a
  // permanent narrowing across an awaited load.
  return signal?.aborted === true;
}

function isCancellationRequested(cancelled: boolean, signal: AbortSignalLike | undefined): boolean {
  return cancelled || isAborted(signal);
}

/**
 * Wraps a renderer- or transport-specific resource loader with the normative
 * state, progress, cancellation, late-result cleanup, and ownership behavior.
 */
export function createAssetLoader<TResource>(
  loadResource: AssetResourceLoadImplementation<TResource>,
  disposeResource: (resource: TResource) => void,
): AssetLoader<TResource> {
  return Object.freeze({
    async load(
      request: AssetLoadRequest,
      observer?: AssetLoadObserver,
    ): Promise<LoadedAsset<TResource>> {
      if (isAborted(request.signal)) {
        observer?.onStateChange?.("cancelled");
        throw new AssetLoadCancelledError();
      }

      let cancelled = false;
      let cancellationError: AssetLoadCancelledError | undefined;
      let rejectCancellation: ((reason: AssetLoadCancelledError) => void) | undefined;
      const cancellation = new Promise<never>((_resolve, reject) => {
        rejectCancellation = reject;
      });
      const handleAbort = (): void => {
        if (cancelled) {
          return;
        }
        cancelled = true;
        cancellationError = new AssetLoadCancelledError();
        observer?.onStateChange?.("cancelled");
        rejectCancellation?.(cancellationError);
      };
      request.signal?.addEventListener("abort", handleAbort);
      observer?.onStateChange?.("loading");

      const context: AssetResourceLoadContext = Object.freeze({
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        reportProgress(progress: AssetLoadProgress): void {
          if (isCancellationRequested(cancelled, request.signal)) {
            throw cancellationError ?? new AssetLoadCancelledError();
          }
          const validatedProgress = validateProgress(progress);
          observer?.onProgress?.(validatedProgress);
        },
        throwIfCancelled(): void {
          if (isCancellationRequested(cancelled, request.signal)) {
            throw cancellationError ?? new AssetLoadCancelledError();
          }
        },
      });

      const resourcePromise = Promise.resolve().then(() => loadResource(request, context));
      try {
        const resource = await Promise.race([resourcePromise, cancellation]);
        if (isCancellationRequested(cancelled, request.signal)) {
          throw cancellationError ?? new AssetLoadCancelledError();
        }

        observer?.onStateChange?.("ready");
        return createLoadedAsset({
          manifest: request.manifest,
          request: requestWithoutSignal(request),
          resource,
          disposeResource,
          onDisposed: () => observer?.onStateChange?.("disposed"),
        });
      } catch (error) {
        if (isCancellationRequested(cancelled, request.signal)) {
          void resourcePromise.then(
            (resource) => disposeLateResource(disposeResource, resource),
            () => undefined,
          );
          throw cancellationError ?? new AssetLoadCancelledError();
        }
        observer?.onStateChange?.("error");
        throw error;
      } finally {
        request.signal?.removeEventListener("abort", handleAbort);
      }
    },
  });
}
