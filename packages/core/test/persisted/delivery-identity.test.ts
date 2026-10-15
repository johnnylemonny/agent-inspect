import { describe, expect, it } from "vitest";

import {
  DELIVERY_EVENT_BASE_ATTR,
  deliveryEventBaseFromIndexedId,
  stripReaderDeliveryDiscriminator,
} from "../../src/persisted/delivery-identity.js";

describe("delivery-identity provenance strip", () => {
  it("does not strip native synthetic-shaped ids without delivery_event_base", () => {
    expect(stripReaderDeliveryDiscriminator("manual:run1:tool:step1:1")).toBe(
      "manual:run1:tool:step1:1",
    );
    expect(stripReaderDeliveryDiscriminator("inspect:run1:TOOL:retrieve:2")).toBe(
      "inspect:run1:TOOL:retrieve:2",
    );
    expect(stripReaderDeliveryDiscriminator("execution:1")).toBe("execution:1");
  });

  it("strips only when stamped base matches indexed id", () => {
    const base = "manual:run:step_started:step_a";
    expect(
      stripReaderDeliveryDiscriminator(`${base}:7`, {
        [DELIVERY_EVENT_BASE_ATTR]: base,
      }),
    ).toBe(base);
    expect(
      stripReaderDeliveryDiscriminator("manual:run:step_started:step_b:3", {
        [DELIVERY_EVENT_BASE_ATTR]: base,
      }),
    ).toBe("manual:run:step_started:step_b:3");
  });

  it("deliveryEventBaseFromIndexedId removes trailing index", () => {
    expect(deliveryEventBaseFromIndexedId("manual:a:b:c:9")).toBe("manual:a:b:c");
    expect(deliveryEventBaseFromIndexedId("execution:1")).toBe("execution");
    expect(deliveryEventBaseFromIndexedId("no-index")).toBeUndefined();
  });
});
