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

  it("never hands the tenant the broker's number: the person from Mkan sets up the viewing", () => {
    const m = brokerAnswerMessage("en", "2BR in Kicukiro", true, LINK, false, "Osman");
    expect(m).toContain("Osman from Mkan will message you here");
    expect(m).toMatch(/free for you/);
    expect(m).not.toMatch(/\+?250\d|wa\.me|Call or WhatsApp them/);
    expect(brokerAnswerMessage("ar", "شقة", true, LINK, true, "Osman")).toContain("أو اختر موعداً");
    expect(brokerAnswerMessage("rw", "Inzu", true, LINK, false, "Osman")).toContain("Osman wo muri Mkan");
  });

  it("offers the time picker only when the broker offered times on the form", () => {
    expect(brokerAnswerMessage("en", "2BR", true, LINK, true, "Osman")).toContain("Or pick a viewing time here:");
    expect(brokerAnswerMessage("en", "2BR", true, LINK, false, "Osman")).not.toContain("pick a viewing time");
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
