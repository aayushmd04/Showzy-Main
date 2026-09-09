import { describe, expect, it } from "vitest";
import { detectContactInfo } from "./contact-filter";

describe("detectContactInfo", () => {
  it("passes ordinary negotiation messages clean", () => {
    expect(detectContactInfo("Can you do two 45 minute sets?")).toBeNull();
    expect(detectContactInfo("Backline is on us, load-in from 6pm.")).toBeNull();
  });

  it("does not flag a rupee amount on its own", () => {
    expect(detectContactInfo("How about 9000 for the night?")).toBeNull();
  });

  it("flags a 10-digit phone number", () => {
    const flag = detectContactInfo("just call me on 9845011223 instead");
    expect(flag?.reason).toBe("phone number");
  });

  it("flags a phone number with spaces or dashes", () => {
    expect(detectContactInfo("98450-11223")?.reason).toBe("phone number");
    expect(detectContactInfo("+91 98450 11223")?.reason).toBe("phone number");
  });

  it("flags an email address", () => {
    expect(detectContactInfo("send it to rohan@example.com")?.reason).toBe(
      "email address",
    );
  });

  it("flags a UPI ID", () => {
    expect(detectContactInfo("just gpay rohan@okhdfcbank")?.reason).toBe("UPI ID");
    expect(detectContactInfo("rohan@paytm works fine")?.reason).toBe("UPI ID");
  });

  it("flags an @handle", () => {
    expect(detectContactInfo("hit me up @rohanplays on insta")?.reason).toBe(
      "social handle",
    );
  });

  it("flags a mention of WhatsApp regardless of spacing", () => {
    expect(detectContactInfo("let's move to whatsapp")?.reason).toBe(
      "mention of WhatsApp",
    );
    expect(detectContactInfo("ping me on Whats App")?.reason).toBe(
      "mention of WhatsApp",
    );
  });
});
