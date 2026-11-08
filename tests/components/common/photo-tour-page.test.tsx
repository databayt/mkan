// @vitest-environment jsdom
// databayt/mkan#54: "عرض جميع صور العقار" opened a spinner, then an empty placeholder.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

const getListing = vi.fn();
vi.mock("@/lib/actions/listing-actions", () => ({ getListing: (...a: unknown[]) => getListing(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back() {} }), useParams: () => ({ id: "1002-01" }) }));
vi.mock("@/components/internationalization/dictionary-context", () => ({ useDictionary: () => ({}) }));
vi.mock("@/components/internationalization/use-dictionary", () => ({ useDictionary: () => ({}) }));
vi.mock("@/components/listings/photo-tour", () => ({
  default: ({ sections }: { sections: { photos: string[] }[] }) => <div data-testid="tour">{sections[0]!.photos.length}</div>,
}));

import PhotoTourPage from "@/app/[lang]/listings/[id]/photos/page";

describe("photo tour page", () => {
  it("asks for the listing by its public code, as-is, and shows its photos", async () => {
    getListing.mockResolvedValue({ photoUrls: ["a.jpg", "b.jpg"] });
    const { getByTestId } = render(<PhotoTourPage />);
    await waitFor(() => expect(getByTestId("tour").textContent).toBe("2"));
    expect(getListing).toHaveBeenCalledWith("1002-01");
  });
});
