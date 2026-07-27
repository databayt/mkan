import { describe, it, expect } from "vitest";
import { parseHouseRules, toListingHouseRules } from "../../scripts/crm/house-rules";

describe("parseHouseRules", () => {
  it("reads the check-in and checkout times", () => {
    const p = parseHouseRules(["Check-in after 3:00 PM", "Checkout before 11:00 AM"]);
    expect(p.checkInTime).toBe("3:00 PM");
    expect(p.checkOutTime).toBe("11:00 AM");
  });

  it("leaves check-in null when Airbnb says it is flexible", () => {
    // Inventing a time here would be worse than recording none — the host
    // would inherit a rule they never set.
    expect(parseHouseRules(["Flexible check-in"]).checkInTime).toBeNull();
  });

  it("distinguishes allowed from not allowed", () => {
    expect(parseHouseRules(["No pets"]).petsAllowed).toBe(false);
    expect(parseHouseRules(["Pets allowed"]).petsAllowed).toBe(true);
    expect(parseHouseRules(["No parties or events"]).eventsAllowed).toBe(false);
    expect(parseHouseRules(["Smoking is allowed"]).smokingAllowed).toBe(true);
  });

  it("does not read 'No pets' as pets being allowed", () => {
    // The failure a looser /pets/ pattern would produce, on 14 real listings.
    const p = parseHouseRules(["No pets"]);
    expect(p.petsAllowed).toBe(false);
    expect(p.additional).toHaveLength(0);
  });

  it("reads the guest maximum, including the double-spaced form Airbnb emits", () => {
    expect(parseHouseRules(["4 guests maximum"]).guestsMaximum).toBe(4);
    expect(parseHouseRules(["1  guest maximum"]).guestsMaximum).toBe(1);
  });

  it("keeps anything it does not recognise instead of dropping it", () => {
    const p = parseHouseRules(["Check-in after 3:00 PM", "Please remove your shoes indoors"]);
    expect(p.checkInTime).toBe("3:00 PM");
    expect(p.additional).toEqual(["Please remove your shoes indoors"]);
  });

  it("says nothing when Airbnb says nothing", () => {
    const p = parseHouseRules([]);
    expect(p.petsAllowed).toBeNull();
    expect(p.smokingAllowed).toBeNull();
  });

  it("handles a real listing's full rule set", () => {
    const p = parseHouseRules([
      "Check-in after 3:00 PM",
      "Checkout before 12:00 PM",
      "4 guests maximum",
      "No pets",
      "No parties or events",
    ]);
    expect(p).toMatchObject({
      checkInTime: "3:00 PM",
      checkOutTime: "12:00 PM",
      guestsMaximum: 4,
      petsAllowed: false,
      eventsAllowed: false,
    });
    expect(p.additional).toHaveLength(0);
  });
});

describe("toListingHouseRules", () => {
  it("omits booleans Airbnb never stated rather than sending false", () => {
    // The editor coerces a missing key to false; a stored null would read as
    // "the host said no" when in fact nobody said anything.
    const json = toListingHouseRules(parseHouseRules(["No pets"]))!;
    expect(json).toEqual({ petsAllowed: false });
    expect(json).not.toHaveProperty("smokingAllowed");
  });

  it("returns null when there is nothing to store", () => {
    expect(toListingHouseRules(parseHouseRules(["Check-in after 3:00 PM"]))).toBeNull();
  });

  it("puts unparsed rules in additionalRules so the host can edit them", () => {
    const json = toListingHouseRules(parseHouseRules(["Quiet please", "No shoes"]))!;
    expect(json.additionalRules).toBe("Quiet please\nNo shoes");
  });
});

describe("the shapes the first run over real data turned up", () => {
  it("takes the opening time from a check-in window", () => {
    // "Check-in: 12:00 PM - 2:00 PM" on 10 listings. The close is not a field
    // mkan has, and the open is what a guest needs.
    expect(parseHouseRules(["Check-in: 12:00 PM - 2:00 PM"]).checkInTime).toBe("12:00 PM");
    expect(parseHouseRules(["Check-in: 8:00 AM - 9:00 PM"]).checkInTime).toBe("8:00 AM");
  });

  it("maps self check-in onto mkan's CheckInMethod", () => {
    expect(parseHouseRules(["Self check-in with lockbox"]).checkInMethod).toBe("Lockbox");
    expect(parseHouseRules(["Self check-in with smart lock"]).checkInMethod).toBe("SmartLock");
    expect(parseHouseRules(["Self check-in"]).checkInMethod).toBe("SelfCheckIn");
  });

  it("keeps lockbox from being swallowed by the generic self check-in rule", () => {
    // Ordering: the generic pattern matches the specific string too.
    expect(parseHouseRules(["Self check-in with lockbox"]).checkInMethod).not.toBe("SelfCheckIn");
  });

  it("reads commercial photography, which the app already models", () => {
    expect(parseHouseRules(["Commercial photography allowed"]).commercialPhotographyAllowed).toBe(true);
    const json = toListingHouseRules(parseHouseRules(["Commercial photography allowed"]))!;
    expect(json.commercialPhotographyAllowed).toBe(true);
  });
});
