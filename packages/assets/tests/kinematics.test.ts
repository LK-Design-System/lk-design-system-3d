import { describe, expect, it } from "vitest";
import { composeTransforms, transformPoint, framedPoint3, frameId } from "@lk-robotics/lds-3d-core";

import {
  KinematicsValidationError,
  clampJointValue,
  computeJointPoses,
  createJointFrameTransforms,
  parseRobotKinematics,
  validateRobotKinematics,
  type RobotKinematicsV1,
} from "../src/kinematics.js";

const HALF_SQRT2 = Math.SQRT1_2;

const VALID_INPUT = {
  schemaVersion: 1,
  assetId: "fixture/so-arm-mini",
  version: "1.0.0",
  baseLink: "base",
  links: [
    { linkId: "base", nodeName: "Base" },
    { linkId: "shoulder", nodeName: "Shoulder" },
    { linkId: "elbow", nodeName: "Elbow" },
    { linkId: "slider", nodeName: "Slider" },
  ],
  joints: [
    {
      jointId: "yaw",
      type: "revolute",
      parentLink: "base",
      childLink: "shoulder",
      origin: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: -Math.PI, upper: Math.PI },
    },
    {
      jointId: "pitch",
      type: "revolute",
      parentLink: "shoulder",
      childLink: "elbow",
      origin: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
      axis: [0, 1, 0],
      limits: { lower: -Math.PI / 2, upper: Math.PI / 2 },
    },
    {
      jointId: "slide",
      type: "prismatic",
      parentLink: "elbow",
      childLink: "slider",
      origin: { translation: [0.2, 0, 0], rotation: [0, 0, 0, 1] },
      axis: [1, 0, 0],
      limits: { lower: 0, upper: 0.05 },
    },
  ],
};

function parseValidFixture(): RobotKinematicsV1 {
  const result = parseRobotKinematics(VALID_INPUT);
  if (!result.ok) throw new Error("Fixture must parse.");
  return result.value;
}

function withInput(mutate: (input: Record<string, unknown>) => void): unknown {
  const clone = JSON.parse(JSON.stringify(VALID_INPUT)) as Record<string, unknown>;
  mutate(clone);
  return clone;
}

function linkAt(input: Record<string, unknown>, index: number): Record<string, unknown> {
  const link = (input.links as Record<string, unknown>[])[index];
  if (link === undefined) throw new Error(`Fixture is missing link ${String(index)}.`);
  return link;
}

function jointAt(input: Record<string, unknown>, index: number): Record<string, unknown> {
  const joint = (input.joints as Record<string, unknown>[])[index];
  if (joint === undefined) throw new Error(`Fixture is missing joint ${String(index)}.`);
  return joint;
}

function issueCodes(input: unknown): readonly string[] {
  return validateRobotKinematics(input).map((entry) => entry.code);
}

describe("validateRobotKinematics", () => {
  it("accepts the fixture chain", () => {
    expect(validateRobotKinematics(VALID_INPUT)).toEqual([]);
  });

  it("rejects non-object roots and unexpected properties", () => {
    expect(issueCodes(null)).toContain("schema.invalid_root");
    expect(issueCodes(withInput((input) => (input.extra = true)))).toContain(
      "schema.unexpected_property",
    );
  });

  it("rejects duplicate link ids and node names", () => {
    expect(
      issueCodes(
        withInput((input) => {
          linkAt(input, 1).linkId = "base";
        }),
      ),
    ).toContain("kinematics.duplicate_link");
    expect(
      issueCodes(
        withInput((input) => {
          linkAt(input, 1).nodeName = "Base";
        }),
      ),
    ).toContain("kinematics.duplicate_node_name");
  });

  it("rejects joints that reference undeclared or self-parented links", () => {
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).parentLink = "missing";
        }),
      ),
    ).toContain("kinematics.unknown_link");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).parentLink = "shoulder";
        }),
      ),
    ).toContain("kinematics.self_parented_joint");
  });

  it("rejects broken tree topology", () => {
    expect(issueCodes(withInput((input) => (input.baseLink = "missing")))).toContain(
      "kinematics.unknown_base_link",
    );
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).childLink = "base";
        }),
      ),
    ).toContain("kinematics.base_link_has_parent");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 2).childLink = "elbow";
        }),
      ),
    ).toContain("kinematics.multiple_parents");
    expect(
      issueCodes(
        withInput((input) => {
          (input.links as Record<string, unknown>[]).push({
            linkId: "floating",
            nodeName: "Floating",
          });
        }),
      ),
    ).toContain("kinematics.orphan_link");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 1).parentLink = "slider";
        }),
      ),
    ).toContain("kinematics.cycle");
  });

  it("rejects invalid motion declarations", () => {
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).type = "continuous";
        }),
      ),
    ).toContain("kinematics.invalid_joint_type");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).axis = [0, 0, 2];
        }),
      ),
    ).toContain("kinematics.axis_not_normalized");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).origin = {
            translation: [0, 0, 0.1],
            rotation: [0, 0, 0, 2],
          };
        }),
      ),
    ).toContain("transform.quaternion_not_normalized");
    expect(
      issueCodes(
        withInput((input) => {
          jointAt(input, 0).limits = { lower: 1, upper: -1 };
        }),
      ),
    ).toContain("kinematics.invalid_limit_order");
  });
});

describe("parseRobotKinematics", () => {
  it("returns a deeply frozen kinematics value", () => {
    const kinematics = parseValidFixture();
    expect(Object.isFrozen(kinematics)).toBe(true);
    expect(Object.isFrozen(kinematics.links)).toBe(true);
    expect(Object.isFrozen(kinematics.joints[0])).toBe(true);
    expect(Object.isFrozen(kinematics.joints[0]?.origin.rotation)).toBe(true);
    expect(kinematics.baseLink).toBe(frameId("base"));
  });

  it("reports issues instead of throwing on invalid input", () => {
    const result = parseRobotKinematics({ schemaVersion: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("computeJointPoses", () => {
  it("returns rest origins when no values are supplied", () => {
    const poses = computeJointPoses(parseValidFixture());
    expect(poses.map((pose) => pose.nodeName)).toEqual(["Shoulder", "Elbow", "Slider"]);
    expect(poses[0]?.translation).toEqual([0, 0, 0.1]);
    expect(poses[0]?.rotation).toEqual([0, 0, 0, 1]);
    expect(poses[2]?.translation).toEqual([0.2, 0, 0]);
  });

  it("rotates a revolute joint about its axis", () => {
    const poses = computeJointPoses(parseValidFixture(), { yaw: Math.PI / 2 });
    const [x, y, z, w] = poses[0]?.rotation ?? [0, 0, 0, 0];
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(HALF_SQRT2, 12);
    expect(w).toBeCloseTo(HALF_SQRT2, 12);
  });

  it("slides a prismatic joint along its rotated axis", () => {
    const poses = computeJointPoses(parseValidFixture(), { slide: 0.03 });
    expect(poses[2]?.translation[0]).toBeCloseTo(0.23, 12);
    expect(poses[2]?.rotation).toEqual([0, 0, 0, 1]);
  });

  it("clamps out-of-range and missing values into the declared limits", () => {
    const kinematics = parseValidFixture();
    expect(computeJointPoses(kinematics, { pitch: 10 })[1]?.value).toBeCloseTo(Math.PI / 2, 12);
    const offsetLimits = parseRobotKinematics(
      withInput((input) => {
        jointAt(input, 2).limits = { lower: 0.01, upper: 0.05 };
      }),
    );
    if (!offsetLimits.ok) throw new Error("Fixture must parse.");
    expect(computeJointPoses(offsetLimits.value)[2]?.value).toBeCloseTo(0.01, 12);
    const slideJoint = kinematics.joints[2];
    if (slideJoint === undefined) throw new Error("Fixture is missing joint 2.");
    expect(clampJointValue(slideJoint, -1)).toBe(0);
  });

  it("throws on unknown joint ids and non-finite values", () => {
    const kinematics = parseValidFixture();
    expect(() => computeJointPoses(kinematics, { typo: 0 })).toThrow(KinematicsValidationError);
    expect(() => computeJointPoses(kinematics, { yaw: Number.NaN })).toThrow(
      KinematicsValidationError,
    );
  });
});

describe("createJointFrameTransforms", () => {
  it("emits child-to-parent transforms that compose into forward kinematics", () => {
    const kinematics = parseValidFixture();
    const transforms = createJointFrameTransforms(kinematics, { pitch: Math.PI / 2 });
    expect(transforms.map((transform) => transform.sourceFrame)).toEqual([
      "shoulder",
      "elbow",
      "slider",
    ]);
    expect(transforms.map((transform) => transform.targetFrame)).toEqual([
      "base",
      "shoulder",
      "elbow",
    ]);

    const sliderToElbow = transforms[2];
    const elbowToShoulder = transforms[1];
    if (sliderToElbow === undefined || elbowToShoulder === undefined) {
      throw new Error("Fixture must emit three transforms.");
    }
    const sliderToShoulder = composeTransforms(sliderToElbow, elbowToShoulder);
    const sliderOriginInShoulder = transformPoint(
      sliderToShoulder,
      framedPoint3(frameId("slider"), [0, 0, 0]),
    );
    expect(sliderOriginInShoulder.value[0]).toBeCloseTo(0, 12);
    expect(sliderOriginInShoulder.value[1]).toBeCloseTo(0, 12);
    expect(sliderOriginInShoulder.value[2]).toBeCloseTo(-0.1, 12);
  });
});
