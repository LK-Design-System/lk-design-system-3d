import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};
const catalog = JSON.parse(
  readFileSync(path.join(packageRoot, "robots", "catalog.json"), "utf8"),
) as {
  assets: readonly Readonly<Record<string, unknown>>[];
};

const FILE_KEYS = ["file", "manifest", "kinematics", "provenance"] as const;

// The catalog is a public export, so every file it names must be importable by
// a consumer too. Alpha.2 shipped a catalog pointing at SO-ARM and LK-lift
// files the export map did not list — a catalog entry with dead links.
describe("robots/catalog.json", () => {
  const referenced = catalog.assets.flatMap((robot) =>
    FILE_KEYS.flatMap((key) => {
      const value = robot[key];
      return typeof value === "string" ? [`./robots/${value.replace(/^\.\//, "")}`] : [];
    }),
  );

  it("names at least one file per robot", () => {
    expect(referenced.length).toBeGreaterThanOrEqual(catalog.assets.length);
  });

  it.each(referenced)("exports %s", (subpath) => {
    expect(manifest.exports[subpath]).toBe(subpath);
    expect(existsSync(path.join(packageRoot, subpath))).toBe(true);
  });
});
