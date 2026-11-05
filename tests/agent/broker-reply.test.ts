import { describe, expect, it } from "vitest";
import { isOffer, isRepostAsk, menuChoice, parseBrokerReply, repostAnswer } from "@/components/agent/broker-reply";

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

describe("the 1 / 2 answer to a one-home ask", () => {
  it("reads a bare digit as the answer only when the ask offered it", () => {
    for (const s of ["1", "1.", " 1 ", "1️⃣", "1 yes", "1 = still available", "1 iracyahari", "1 Yego"]) {
      expect(parseBrokerReply(s, { menu: true }).yes, s).toBe(true);
      expect(parseBrokerReply(s, { menu: true }).gone, s).toBe(false);
    }
    for (const s of ["2", "2!", "2️⃣", "2 taken", "2 = taken", "2 yafashwe", "2 déjà prise", "2 byaragiye"]) {
      expect(parseBrokerReply(s, { menu: true }).gone, s).toBe(true);
      expect(parseBrokerReply(s, { menu: true }).yes, s).toBe(false);
    }
    // Without the menu a digit means nothing, as before.
    for (const s of ["1", "2"]) {
      expect(parseBrokerReply(s).yes, s).toBe(false);
      expect(parseBrokerReply(s).gone, s).toBe(false);
    }
  });

  it("never takes a count, a price or a contradiction for a choice", () => {
    for (const s of ["2 bedrooms", "1 bedroom left", "12", "10", "2,000", "1.5m", "2 yes", "1 taken", "1 How much?", "21 Nov"]) expect(menuChoice(s), s).toBeNull();
    expect(parseBrokerReply("2 bedrooms 300k", { menu: true })).toMatchObject({ bedrooms: 2, price: 300_000, gone: false, yes: false });
    expect(parseBrokerReply("1 taken", { menu: true }).yes).toBe(false);
  });

  it("keeps reading words the way it did, menu or not", () => {
    for (const s of ["Yes available", "Iracyahari", "It's still available"]) expect(parseBrokerReply(s, { menu: true }).yes, s).toBe(true);
    for (const s of ["taken", "No", "Byaragiye"]) expect(parseBrokerReply(s, { menu: true }).gone, s).toBe(true);
    expect(parseBrokerReply("How much?", { menu: true }).question).toBe(true);
    expect(parseBrokerReply("Hello", { menu: true }).greeting).toBe(true);
  });
});

describe("the TikTok repost ask", () => {
  it("knows the ask in each language it goes out in", async () => {
    const { brokerAsk, brokerPreviewAsk } = await import("../../scripts/crm/tiktok-post-pure");
    for (const lang of ["EN", "RW", "FR"]) {
      expect(isRepostAsk(brokerAsk("Aline", "ibrahouserent", "mkan.rw", lang))).toBe(true);
      expect(isRepostAsk(brokerPreviewAsk("Aline", "ibrahouserent", "mkan.rw", "https://cdn.databayt.org/x.mp4", lang))).toBe(true);
    }
    expect(isRepostAsk("Hey there, is this available? https://www.tiktok.com/@x/video/1")).toBe(false);
    expect(isRepostAsk("I'm looking for a 2-bedroom in Kibagabaga")).toBe(false);
  });

  it("reads a plain yes or no, in English, Kinyarwanda and French", () => {
    for (const t of ["YES", "Yes you can", "yego", "Yego rwose", "Oui", "ok", "Okay no problem", "No problem", "Sure, go ahead", "Ni sawa", "d'accord"]) expect(repostAnswer(t), t).toBe("YES");
    for (const t of ["No", "no thanks", "Oya", "Non merci", "Not now"]) expect(repostAnswer(t), t).toBe("NO");
  });

  it("leaves anything hedged for a person — a YES is a permission", () => {
    for (const t of ["ok let me think", "Okay I'll check with the owner first", "yes?", "How much commission?", "Who are you?", "Irahari", "Taken", "", "👍"]) expect(repostAnswer(t), t).toBeNull();
  });
});
