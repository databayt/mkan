import { afterEach, describe, expect, it } from "vitest";
import { brokerAnswerMessage } from "@/components/agent/broker-message";
import { hookToken, hookUrl } from "@/lib/whatsapp/evolution";

const LINK = "https://mkan.sd/en/find?c=task1";

describe("brokerAnswerMessage", () => {
  it("tells the tenant a home is free, with the chat link", () => {
    const m = brokerAnswerMessage("en", "2BR in Kicukiro", true, LINK);
    expect(m).toContain('"2BR in Kicukiro" is still available');
    expect(m.endsWith(LINK)).toBe(true);
  });

  it("hands the tenant the broker's number with a yes", () => {
    const m = brokerAnswerMessage("en", "2BR in Kicukiro", true, LINK, false, "+250 700 000 001");
    expect(m).toContain("Call or WhatsApp them to arrange a viewing: +250700000001");
    expect(m).toContain("https://wa.me/250700000001");
    expect(m).not.toContain("Or pick");
    expect(brokerAnswerMessage("ar", "شقة", true, LINK, true, "250700000001")).toContain("أو اختر موعداً");
    expect(brokerAnswerMessage("en", "2BR", false, LINK, false, "+250700000001")).not.toContain("+250");
  });

  it("offers the time picker alone when there is no number", () => {
    expect(brokerAnswerMessage("en", "2BR", true, LINK)).toContain("still available.\nPick a viewing time here:");
  });

  it("says taken in the tenant's language", () => {
    expect(brokerAnswerMessage("ar", "شقة", false, LINK)).toContain("مؤجَّر");
    expect(brokerAnswerMessage("rw", "Inzu", false, LINK)).toContain("yamaze gufatwa");
  });
});

describe("webhook token", () => {
  const saved = process.env.MKAN_WA_BRIDGE_SECRET;
  afterEach(() => {
    process.env.MKAN_WA_BRIDGE_SECRET = saved;
  });

  it("is derived from the bridge secret, never the secret itself", () => {
    process.env.MKAN_WA_BRIDGE_SECRET = "test-secret-one";
    const a = hookToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("test-secret");
    process.env.MKAN_WA_BRIDGE_SECRET = "test-secret-two";
    expect(hookToken()).not.toBe(a);
    expect(hookUrl()).toBe(`https://www.mkan.sd/api/whatsapp/hook/${hookToken()}`);
  });
});
