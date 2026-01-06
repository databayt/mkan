/**
 * Pagination utilities for consistent pagination across the application
 */

export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

/**
 * Get pagination parameters with validation
 * @param params - Optional pagination parameters
 * @returns Validated pagination parameters with skip calculated
 */
export function getPaginationParams(params?: PaginationParams) {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build a paginated result object
 * @param data - The data array
 * @param total - Total number of items
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Paginated result with metadata
 */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get pagination metadata for frontend display
 * @param total - Total number of items
 * @param page - Current page
 * @param limit - Items per page
 * @returns Pagination metadata
 */
export function getPaginationMetadata(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return {
    total,
    totalPages,
    currentPage: page,
    itemsPerPage: limit,
    start,
    end,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    showing: `${start}-${end} of ${total}`,
  };
}
