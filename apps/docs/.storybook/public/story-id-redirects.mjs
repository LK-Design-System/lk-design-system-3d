/* global URL, window */

export const STORY_ID_REDIRECTS = Object.freeze({
  "assets--validation-report": "lds-3d-assets-validation--overview",
  "assets--invalid-manifest-cases": "lds-3d-assets-validation--invalid-manifest",
  "foundations--raw-three-scene-host": "lds-3d-foundations-three-scene-host--overview",
  "lds-3d-primitives--selection": "lds-3d-primitives-selectable--overview",
  "lds-3d-primitives--amr-robot": "lds-3d-primitives-amr-robot--overview",
  "lds-3d-primitives--goal-marker": "lds-3d-primitives-goal-marker--overview",
  "lds-3d-primitives--path-ribbon": "lds-3d-primitives-path-ribbon--overview",
  "lds-3d-primitives--runtime-states": "lds-3d-primitives-scene-state-marker--overview",
  "lds-3d-primitives--gltf-model": "lds-3d-primitives-gltf-model--overview",
  "lds-3d-primitives--point-cloud-layer": "lds-3d-primitives-point-cloud-layer--overview",
  "lds-3d-primitives--spatial-editing": "lds-3d-primitives-spatial-editing--overview",
  "lds-3d-primitives--spatial-structure": "lds-3d-primitives-spatial-authoring--overview",
  "lds-3d-scenes-point-cloud-foundation--spatial-editing":
    "lds-3d-scenes-spatial-editing--overview",
  "visual-alpha--asset-catalog": "lds-3d-scenes-asset-review--overview",
  "visual-alpha--goal-and-path-states": "lds-3d-states-goal-and-path--overview",
  "visual-alpha--loading-error-empty": "lds-3d-states-renderer-lifecycle--overview",
  "visual-alpha--actual-lds-composition":
    "lds-3d-lds-integration-operations-viewer--overview",
});

export function resolveStoryIdRedirect(href) {
  const url = new URL(href);
  const iframeStoryId = url.searchParams.get("id");
  if (iframeStoryId !== null && STORY_ID_REDIRECTS[iframeStoryId] !== undefined) {
    url.searchParams.set("id", STORY_ID_REDIRECTS[iframeStoryId]);
    return url.toString();
  }

  const managerPath = url.searchParams.get("path");
  const storyPrefix = "/story/";
  if (managerPath?.startsWith(storyPrefix)) {
    const storyId = managerPath.slice(storyPrefix.length);
    const replacement = STORY_ID_REDIRECTS[storyId];
    if (replacement !== undefined) {
      url.searchParams.set("path", `${storyPrefix}${replacement}`);
      return url.toString();
    }
  }

  return null;
}

if (typeof window !== "undefined") {
  const redirect = resolveStoryIdRedirect(window.location.href);
  if (redirect !== null) window.location.replace(redirect);
}
