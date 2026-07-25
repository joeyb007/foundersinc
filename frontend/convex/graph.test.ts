import { describe, expect, test } from "vitest";

import { AGENT_TIER, TIER_LABEL, groupIntoWaves } from "./graph";

const t = (agentType: string, id = agentType) => ({ agentType, id });

describe("execution waves", () => {
  test("orders waves by tier, lowest first", () => {
    const waves = groupIntoWaves([t("docs"), t("swe"), t("pm"), t("qa")]);
    expect(waves.map((w) => w.map((x) => x.agentType))).toEqual([
      ["pm"],
      ["swe"],
      ["qa"],
      ["docs"],
    ]);
  });

  test("keeps same-tier agents in one wave so they run concurrently", () => {
    // The whole point of waves is ordering *between* tiers — parallelism
    // inside a tier must survive.
    const waves = groupIntoWaves([t("swe"), t("ux"), t("devops"), t("security")]);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(4);
  });

  test("emits no wave for a tier with no tickets", () => {
    // An epic with no `pm` ticket must not stall on an empty planning wave.
    const waves = groupIntoWaves([t("ui"), t("qa")]);
    expect(waves).toHaveLength(2);
    expect(waves[0][0].agentType).toBe("ui");
  });

  test("surfaces precede verification precedes documentation", () => {
    expect(AGENT_TIER.ux).toBeLessThan(AGENT_TIER.ui);
    expect(AGENT_TIER.ui).toBeLessThan(AGENT_TIER.qa);
    expect(AGENT_TIER.swe).toBeLessThan(AGENT_TIER.qa);
    expect(AGENT_TIER.qa).toBeLessThan(AGENT_TIER.docs);
    expect(AGENT_TIER.dataeng).toBeLessThan(AGENT_TIER.ds);
    expect(AGENT_TIER.ds).toBeLessThan(AGENT_TIER.ml);
  });

  test("every tier in use has a label", () => {
    for (const tier of new Set(Object.values(AGENT_TIER))) {
      expect(TIER_LABEL[tier]).toBeTruthy();
    }
  });

  test("an unknown agentType falls into the foundations wave rather than vanishing", () => {
    const waves = groupIntoWaves([t("not-a-real-role")]);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(1);
  });
});
