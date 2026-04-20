import { describe, it, expect } from "vitest";
import {
  getPaginationParams,
  buildPaginatedResult,
  getPaginationMetadata,
} from "@/lib/utils/pagination";

// ---------- getPaginationParams ----------
describe("getPaginationParams", () => {
  it("returns defaults when no params given", () => {
    const result = getPaginationParams();
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("returns defaults when params is undefined", () => {
    const result = getPaginationParams(undefined);
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("calculates skip from page and limit", () => {
    const result = getPaginationParams({ page: 3, limit: 10 });
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it("clamps page to minimum of 1", () => {
    const result = getPaginationParams({ page: 0 });
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("clamps negative page to 1", () => {
    const result = getPaginationParams({ page: -5 });
    expect(result.page).toBe(1);
  });

  it("clamps limit to minimum of 1", () => {
    const result = getPaginationParams({ limit: 0 });
    expect(result.limit).toBe(1);
  });

  it("clamps limit to maximum of 100", () => {
    const result = getPaginationParams({ limit: 500 });
    expect(result.limit).toBe(100);
  });
});

// ---------- buildPaginatedResult ----------
describe("buildPaginatedResult", () => {
  it("returns data with correct pagination metadata", () => {
    const result = buildPaginatedResult(["a", "b"], 10, 1, 2);
    expect(result.data).toEqual(["a", "b"]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 10,
      totalPages: 5,
      hasNext: true,
      hasPrev: false,
    });
  });

  it("indicates hasPrev when not on first page", () => {
    const result = buildPaginatedResult(["c"], 10, 3, 2);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it("indicates no hasNext on last page", () => {
    const result = buildPaginatedResult(["x"], 5, 5, 1);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it("handles empty data", () => {
    const result = buildPaginatedResult([], 0, 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it("calculates totalPages correctly with remainder", () => {
    const result = buildPaginatedResult([], 11, 1, 5);
    expect(result.pagination.totalPages).toBe(3); // ceil(11/5) = 3
  });
});

// ---------- getPaginationMetadata ----------
describe("getPaginationMetadata", () => {
  it("returns correct metadata for first page", () => {
    const result = getPaginationMetadata(50, 1, 10);
    expect(result).toEqual({
      total: 50,
      totalPages: 5,
      currentPage: 1,
      itemsPerPage: 10,
      start: 1,
      end: 10,
      hasNext: true,
      hasPrev: false,
      showing: "1-10 of 50",
    });
  });

  it("returns correct metadata for middle page", () => {
    const result = getPaginationMetadata(50, 3, 10);
    expect(result).toMatchObject({
      currentPage: 3,
      start: 21,
      end: 30,
      hasNext: true,
      hasPrev: true,
      showing: "21-30 of 50",
    });
  });

  it("caps end to total on last page", () => {
    const result = getPaginationMetadata(25, 3, 10);
    expect(result.end).toBe(25); // min(30, 25)
    expect(result.hasNext).toBe(false);
    expect(result.showing).toBe("21-25 of 25");
  });

  it("handles single item", () => {
    const result = getPaginationMetadata(1, 1, 10);
    expect(result.start).toBe(1);
    expect(result.end).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.showing).toBe("1-1 of 1");
  });

  it("handles zero total items", () => {
    const result = getPaginationMetadata(0, 1, 10);
    expect(result.totalPages).toBe(0);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
    expect(result.showing).toBe("1-0 of 0");
  });
});
