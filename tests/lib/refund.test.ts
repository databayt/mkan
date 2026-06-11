import { describe, expect, it } from "vitest";

import { computeRefundAmount } from "@/lib/refund";

const HOUR = 1;
const DAY = 24;

describe("computeRefundAmount", () => {
  it("returns nothing when no money was paid", () => {
    const r = computeRefundAmount({ policy: "Flexible", totalPaid: 0, hoursBeforeCheckIn: 100 });
    expect(r.refundAmount).toBe(0);
    expect(r.isFullRefund).toBe(true);
  });

  it("never refunds after check-in (regardless of policy)", () => {
    const r = computeRefundAmount({ policy: "Flexible", totalPaid: 200, hoursBeforeCheckIn: -1 });
    expect(r.refundAmount).toBe(0);
    expect(r.reason).toMatch(/after check-in/i);
  });

  describe("Flexible", () => {
    it("full refund 24h+ before check-in", () => {
      const r = computeRefundAmount({ policy: "Flexible", totalPaid: 300, cleaningFee: 50, hoursBeforeCheckIn: 25 });
      expect(r.refundAmount).toBe(300);
      expect(r.isFullRefund).toBe(true);
    });

    it("partial refund within 24h: cleaning fee kept", () => {
      const r = computeRefundAmount({ policy: "Flexible", totalPaid: 300, cleaningFee: 50, hoursBeforeCheckIn: 12 });
      expect(r.refundAmount).toBe(250);
      expect(r.isFullRefund).toBe(false);
    });

    it("treats null policy as Flexible", () => {
      const r = computeRefundAmount({ policy: null, totalPaid: 100, hoursBeforeCheckIn: 48 });
      expect(r.refundAmount).toBe(100);
    });
  });

  describe("Moderate", () => {
    it("full refund 5+ days before check-in", () => {
      const r = computeRefundAmount({ policy: "Moderate", totalPaid: 600, cleaningFee: 100, hoursBeforeCheckIn: 6 * DAY });
      expect(r.refundAmount).toBe(600);
    });

    it("50% nightly + cleaning fee within 5 days, more than 24h", () => {
      const r = computeRefundAmount({ policy: "Moderate", totalPaid: 600, cleaningFee: 100, hoursBeforeCheckIn: 3 * DAY });
      // nightly = 500, half = 250, + cleaning 100 => 350
      expect(r.refundAmount).toBe(350);
    });

    it("no refund within 24h", () => {
      const r = computeRefundAmount({ policy: "Moderate", totalPaid: 600, cleaningFee: 100, hoursBeforeCheckIn: 12 });
      expect(r.refundAmount).toBe(0);
    });
  });

  describe("Firm", () => {
    it("full refund 30+ days before check-in", () => {
      const r = computeRefundAmount({ policy: "Firm", totalPaid: 400, hoursBeforeCheckIn: 31 * DAY });
      expect(r.refundAmount).toBe(400);
    });

    it("no refund within 30 days", () => {
      const r = computeRefundAmount({ policy: "Firm", totalPaid: 400, hoursBeforeCheckIn: 29 * DAY });
      expect(r.refundAmount).toBe(0);
      expect(r.reason).toMatch(/30 days/i);
    });
  });

  describe("Strict", () => {
    it("full refund 7+ days before check-in", () => {
      const r = computeRefundAmount({ policy: "Strict", totalPaid: 500, hoursBeforeCheckIn: 8 * DAY });
      expect(r.refundAmount).toBe(500);
    });

    it("no refund within 7 days", () => {
      const r = computeRefundAmount({ policy: "Strict", totalPaid: 500, hoursBeforeCheckIn: 5 * DAY });
      expect(r.refundAmount).toBe(0);
    });
  });

  describe("NonRefundable", () => {
    it("never refunds, even far in advance", () => {
      const r = computeRefundAmount({ policy: "NonRefundable", totalPaid: 200, hoursBeforeCheckIn: 100 * DAY });
      expect(r.refundAmount).toBe(0);
    });
  });

  it("returns Stripe-ready minor units", () => {
    const r = computeRefundAmount({ policy: "Flexible", totalPaid: 12.5, hoursBeforeCheckIn: 48 });
    expect(r.refundAmount).toBe(12.5);
    expect(r.refundAmountMinor).toBe(1250);
  });
});
