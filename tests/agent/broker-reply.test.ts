import { describe, expect, it } from "vitest";
import { isOffer, parseBrokerReply } from "@/components/agent/broker-reply";

// Shapes from real Kigali broker chats (October 2026).
describe("parseBrokerReply", () => {
  it("reads a bare price", () => {
    expect(parseBrokerReply("500k").price).toBe(500_000);
    expect(parseBrokerReply("I have it in kicukiro for 500k")).toMatchObject({ price: 500_000, place: "Kicukiro" });
  });

  it("reads the caption brokers send under an album", () => {
    const r = parseBrokerReply("Kibagabaga \n2 bedrooms \n2 bathrooms \nPrice: 300k");
    expect(r).toMatchObject({ price: 300_000, bedrooms: 2, bathrooms: 2, place: "Kibagabaga", gone: false, question: false });
    expect(isOffer(r)).toBe(true);
    expect(parseBrokerReply("House for rent at kanombe on main road\n3 bedroom\n2 bathroom\nPrice 400k")).toMatchObject({ price: 400_000, bedrooms: 3, bathrooms: 2, place: "Kanombe" });
    expect(parseBrokerReply("This is kimironko 1 bedroom at 400k")).toMatchObject({ price: 400_000, bedrooms: 1, place: "Kimironko" });
  });

  it("reads RWF written out, dollars and furnishing", () => {
    expect(parseBrokerReply("🏡 KIMIRONKO UNFURNISHED HOUSE\n💰 Price: 300,000 RWF").price).toBe(300_000);
    expect(parseBrokerReply("KIMIRONKO UNFURNISHED HOUSE").furnished).toBe(false);
    expect(parseBrokerReply("Gacuriro furnished apartment, 2 bedrooms, Price: $800 per month negotiable")).toMatchObject({ priceUsd: 800, price: null, furnished: true, bedrooms: 2 });
    expect(parseBrokerReply("1 bedroom semi-furnished @400k").furnished).toBe(true);
  });

  it("keeps the visit fee apart from the rent", () => {
    const r = parseBrokerReply("Rent 350k, visiting fee 5k");
    expect(r.price).toBe(350_000);
    expect(r.visitFee).toBe(5_000);
    expect(parseBrokerReply("We actually ask 5k as visiting fee").price).toBeNull();
  });

  it("does not take a sale price, a phone number or room counts for rent", () => {
    expect(parseBrokerReply("House for sale 50m").price).toBeNull();
    expect(parseBrokerReply("Call 0700000011").price).toBeNull();
    expect(parseBrokerReply("3 bedrooms 2 bathrooms").price).toBeNull();
  });

  it("knows a home is gone", () => {
    for (const s of ["taken", "N", "No", "It's taken", "Byaragiye", "Oldest post", "Sorry it was already taken"]) expect(parseBrokerReply(s).gone).toBe(true);
    expect(parseBrokerReply("No, but I have another one for 400k").gone).toBe(false);
  });

  it("knows the broker is asking before offering", () => {
    for (const s of ["How much?", "For how much", "Tell me all\nFeatures&budget", "Where", "Details", "Are single or family"]) expect(parseBrokerReply(s).question).toBe(true);
    expect(parseBrokerReply("500k").question).toBe(false);
    expect(parseBrokerReply("Ok").question).toBe(false);
  });

  it("hears a yes to \"still available?\"", () => {
    for (const s of ["Yes available", "Iracyahari", "It's still available", "Available"]) expect(parseBrokerReply(s).yes).toBe(true);
    expect(parseBrokerReply("No").yes).toBe(false);
  });

  it("hears the yes wherever brokers put it", () => {
    for (const s of [
      "Hello\nNice to e-meet\nIt's available\nTomorrow 10am we can see it",
      "Hi\nIt's available, when do you want to visit?",
      "Yes the apartment it's available\nCall or text me for viewing when you're free",
      "Iyi nzu irahari mwayisura",
      "Hello, when do you want to come and see it?",
    ]) expect(parseBrokerReply(s).yes, s).toBe(true);
    for (const s of [
      "I am available any time to show a client",
      "It's not available",
      "Sorry it was already taken",
      "Ok",
      "Hello",
      "Let me check if it is still available",
      "Is it still available?",
      "Yes?",
      "Available?",
    ]) expect(parseBrokerReply(s).yes, s).toBe(false);
    expect(parseBrokerReply("It's not available, sorry").gone).toBe(true);
  });

  it("knows a bare hello from an answer", () => {
    for (const s of ["Hi", "Hello", "Hello how are you?", "Muraho", "Good morning sir"]) expect(parseBrokerReply(s).greeting, s).toBe(true);
    for (const s of ["Hello who is this?", "Hi, it's available", "Hello\nCan you please make a call", "Thank you for contacting us! How can we help?", "Ok"]) expect(parseBrokerReply(s).greeting, s).toBe(false);
  });
});
