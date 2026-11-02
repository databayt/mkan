import { describe, expect, it } from "vitest";
import { z } from "zod";
import { strictOutputFormat } from "@/components/agent/claude";
import { ReaderOut } from "@/components/agent/reader";

type Node = { enum?: unknown[]; description?: string; properties?: Record<string, Node>; items?: Node };

// SDK 0.137.0's zodOutputFormat folds `enum` into the description text, so the API enforced none
// of the reader's lists and 33 of 68 golden reads failed validation (2026-11-03).
describe("strictOutputFormat", () => {
  it("sends Zod's enums as enums, nested ones too", () => {
    const s = strictOutputFormat(z.object({ a: z.enum(["x", "y"]), b: z.array(z.object({ c: z.enum(["p", "q"]) })) })).schema as Node;
    expect(s.properties!.a!.enum).toEqual(["x", "y"]);
    expect(s.properties!.a!.description).toBeUndefined();
    expect(s.properties!.b!.items!.properties!.c!.enum).toEqual(["p", "q"]);
  });
  it("constrains every list the reader returns", () => {
    const s = strictOutputFormat(ReaderOut).schema as Node;
    expect(s.properties!.set!.items!.properties!.field!.enum).toContain("maxPrice");
    expect(s.properties!.set!.items!.properties!.field!.enum).not.toContain("currency");
    expect(s.properties!.intent!.enum).toEqual(["search", "question", "other"]);
    expect(s.properties!.currency!.enum).toEqual(["RWF", "USD"]);
    expect(s.properties!.clear!.items!.enum!.length).toBeGreaterThan(10);
  });
  it("still validates with Zod on parse", () => {
    const f = strictOutputFormat(z.object({ a: z.enum(["x", "y"]) }));
    expect(f.parse('{"a":"x"}')).toEqual({ a: "x" });
    expect(() => f.parse('{"a":"z"}')).toThrow();
  });
});
