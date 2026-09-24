import { describe, expect, it } from "vitest";

import { canonicalRobotStatus } from "../src/scene.js";

// The 3D robot reads in the same vocabulary as the LDS Robotics 2D pose
// marker (RobotPoseState), so a robot's state does not change name between
// the map and the 3D view.
describe("robot status vocabulary", () => {
  it.each(["moving", "idle", "paused", "fault", "offline", "unknown"] as const)(
    "keeps the canonical %s",
    (status) => {
      expect(canonicalRobotStatus(status)).toBe(status);
    },
  );

  it("maps the pre-alpha.3 spellings onto the canonical states", () => {
    expect(canonicalRobotStatus("live")).toBe("moving");
    expect(canonicalRobotStatus("warning")).toBe("paused");
    expect(canonicalRobotStatus("error")).toBe("fault");
  });
});
