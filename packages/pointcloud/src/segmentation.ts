import { PointCloudValidationError } from "./snapshot.js";

/**
 * Categorical segmentation coloring for point clouds.
 *
 * Semantic class labels become per-point linear RGB colors that feed the
 * existing snapshot `colors` channel (`colorMode: "source"`), so the renderer
 * contract stays untouched: segmentation is a data transform, not a new
 * rendering mode.
 */
export type SegmentationColor = readonly [number, number, number];

/**
 * Default categorical palette in linear RGB, ordered for adjacent-class
 * contrast and readable on both scene themes. Labels wrap modulo the palette
 * length.
 */
export const DEFAULT_SEGMENTATION_PALETTE: readonly SegmentationColor[] = Object.freeze([
  Object.freeze([0.07, 0.43, 0.88] as const), // floor / drivable
  Object.freeze([0.91, 0.49, 0.08] as const), // obstacle
  Object.freeze([0.05, 0.56, 0.36] as const), // vegetation / soft
  Object.freeze([0.43, 0.24, 0.8] as const), // structure
  Object.freeze([0.85, 0.16, 0.22] as const), // dynamic agent
  Object.freeze([0.02, 0.65, 0.82] as const), // fixture
  Object.freeze([0.96, 0.68, 0.04] as const), // caution
  Object.freeze([0.55, 0.57, 0.58] as const), // unknown
]);

function isColorArray(value: readonly SegmentationColor[]): boolean {
  return Array.isArray(value);
}

function assertPalette(palette: readonly SegmentationColor[]): void {
  if (!isColorArray(palette) || palette.length === 0) {
    throw new PointCloudValidationError("Segmentation palette must contain at least one color.");
  }
  palette.forEach((colorInput, index) => {
    const color: readonly number[] = colorInput;
    if (
      color.length !== 3 ||
      color.some((channel) => typeof channel !== "number" || !(channel >= 0 && channel <= 1))
    ) {
      throw new PointCloudValidationError(
        `Segmentation palette entry ${String(index)} must be linear RGB in [0, 1].`,
      );
    }
  });
}

/**
 * Maps one class label per point onto palette colors. Labels must be
 * non-negative safe integers; they wrap modulo the palette length so open
 * label vocabularies never fail closed palettes.
 */
export function createSegmentationColors(
  labels: ArrayLike<number>,
  palette: readonly SegmentationColor[] = DEFAULT_SEGMENTATION_PALETTE,
): Float32Array {
  assertPalette(palette);
  const colors = new Float32Array(labels.length * 3);
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (label === undefined || !Number.isSafeInteger(label) || label < 0) {
      throw new PointCloudValidationError(
        `labels[${String(index)}] must be a non-negative safe integer.`,
      );
    }
    const color = palette[label % palette.length];
    if (color === undefined) {
      throw new PointCloudValidationError("Segmentation palette lookup failed.");
    }
    colors[index * 3] = color[0];
    colors[index * 3 + 1] = color[1];
    colors[index * 3 + 2] = color[2];
  }
  return colors;
}
