// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// The component only needs a locale and an optional dictionary; stubbing both
// keeps this a test of the rule logic rather than of the i18n providers.
let locale = "en";
vi.mock("@/components/internationalization/use-locale", () => ({
  useLocale: () => ({ locale }),
}));
vi.mock("@/components/internationalization/dictionary-context", () => ({
  useDictionary: () => ({}),
}));

import MobileThingsToKnow from "@/components/listings/mobile-things-to-know";

const renderAt = (lang: string, props: React.ComponentProps<typeof MobileThingsToKnow>) => {
  locale = lang;
  return render(<MobileThingsToKnow {...props} />);
};

describe("MobileThingsToKnow — house rules come from the listing", () => {
  it("shows the host's own check-in and checkout times", () => {
    // The bug this replaces: every listing claimed 3:00 PM / 11:00 AM.
    renderAt("en", { checkInTime: "2:00 PM", checkOutTime: "12:00 PM", maxGuests: 4 });
    expect(screen.getByText("Check-in after 2:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Checkout before 12:00 PM")).toBeInTheDocument();
    expect(screen.getByText("4 guests maximum")).toBeInTheDocument();
  });

  it("says check-in is flexible rather than inventing a time", () => {
    renderAt("en", { checkOutTime: "11:00 AM" });
    expect(screen.getByText("Flexible check-in")).toBeInTheDocument();
    expect(screen.queryByText(/Check-in after/)).not.toBeInTheDocument();
  });

  it("does not render a rule the host never stated", () => {
    // An unset boolean is silence, not a "no" — rendering "No smoking" for a
    // host who said nothing puts words in their mouth.
    renderAt("en", { checkInTime: "3:00 PM" });
    expect(screen.queryByText(/smoking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/parties/i)).not.toBeInTheDocument();
  });

  it("renders the rules the host did state", () => {
    renderAt("en", {
      houseRules: { smokingAllowed: false, eventsAllowed: false, commercialPhotographyAllowed: true },
    });
    expect(screen.getByText("No smoking")).toBeInTheDocument();
    expect(screen.getByText("No parties or events")).toBeInTheDocument();
    expect(screen.getByText("Commercial photography allowed")).toBeInTheDocument();
  });

  it("prefers the houseRules pet policy over the column so the two cannot disagree", () => {
    renderAt("en", { petsAllowed: false, houseRules: { petsAllowed: true } });
    expect(screen.getByText("Pets allowed")).toBeInTheDocument();
    expect(screen.queryByText("No pets")).not.toBeInTheDocument();
  });

  it("renders the check-in method and quiet hours when set", () => {
    renderAt("en", {
      checkInMethod: "Lockbox",
      houseRules: { quietHoursEnabled: true, quietHoursStart: "10:00 PM", quietHoursEnd: "7:00 AM" },
    });
    expect(screen.getByText("Self check-in with lockbox")).toBeInTheDocument();
    expect(screen.getByText("Quiet hours 10:00 PM - 7:00 AM")).toBeInTheDocument();
  });

  it("uses the listing's cancellation policy", () => {
    renderAt("en", { cancellationPolicy: "Strict" });
    expect(screen.getByText("Free cancellation within 48 hours of booking only.")).toBeInTheDocument();
  });
});

describe("MobileThingsToKnow — Arabic", () => {
  it("renders the same structured rules in Arabic", () => {
    // The whole point of parsing Airbnb's rules into fields: they render in the
    // viewer's language, not the language they were scraped in.
    renderAt("ar", {
      checkInTime: "2:00 PM",
      maxGuests: 4,
      houseRules: { smokingAllowed: false, petsAllowed: true },
    });
    expect(screen.getByText("تسجيل الوصول بعد 2:00 PM")).toBeInTheDocument();
    expect(screen.getByText("الحد الأقصى 4 ضيوف")).toBeInTheDocument();
    expect(screen.getByText("ممنوع التدخين")).toBeInTheDocument();
    expect(screen.getByText("يُسمح بالحيوانات الأليفة")).toBeInTheDocument();
  });

  it("translates the check-in method and cancellation policy too", () => {
    renderAt("ar", { checkInMethod: "SelfCheckIn", cancellationPolicy: "Flexible" });
    expect(screen.getByText("تسجيل وصول ذاتي")).toBeInTheDocument();
    expect(screen.getByText("إلغاء مجاني حتى 24 ساعة قبل تسجيل الوصول.")).toBeInTheDocument();
  });
});

describe("MobileThingsToKnow — safety comes from the listing's amenities", () => {
  it("reports the equipment the listing actually has", () => {
    // The bug this replaces: every listing simultaneously claimed exterior
    // security cameras and reported no carbon monoxide alarm, on the same page.
    renderAt("en", { amenities: ["SmokeAlarm", "CarbonMonoxideAlarm", "FireExtinguisher"] });
    expect(screen.getByText("Smoke alarm")).toBeInTheDocument();
    expect(screen.getByText("Carbon monoxide alarm")).toBeInTheDocument();
    expect(screen.getByText("Fire extinguisher")).toBeInTheDocument();
    expect(screen.queryByText(/security cameras/i)).not.toBeInTheDocument();
  });

  it("says a detector is unreported only when the amenity list is known", () => {
    // Airbnb states both detectors explicitly, so their absence from a captured
    // list is itself information — but only if we captured a list at all.
    renderAt("en", { amenities: ["WiFi", "Kitchen"] });
    expect(screen.getByText("Smoke alarm not reported")).toBeInTheDocument();
    expect(screen.getByText("Carbon monoxide alarm not reported")).toBeInTheDocument();
  });

  it("stays silent about a listing whose amenities we never captured", () => {
    renderAt("en", { checkInTime: "3:00 PM", amenities: [] });
    expect(screen.queryByText(/not reported/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Safety & property")).not.toBeInTheDocument();
    // The rest of the section still renders.
    expect(screen.getByText("Check-in after 3:00 PM")).toBeInTheDocument();
  });

  it("renders the safety group in Arabic", () => {
    renderAt("ar", { amenities: ["SmokeAlarm", "SecurityCameras", "BedroomLock"] });
    expect(screen.getByText("السلامة والممتلكات")).toBeInTheDocument();
    expect(screen.getByText("جهاز الكشف عن الدخان")).toBeInTheDocument();
    expect(screen.getByText("كاميرات المراقبة الخارجية للعقار")).toBeInTheDocument();
    expect(screen.getByText("قفل لباب غرفة النوم")).toBeInTheDocument();
    expect(
      screen.getByText("لم يتم الإبلاغ عن جهاز الكشف عن أول أكسيد الكربون"),
    ).toBeInTheDocument();
  });
});
