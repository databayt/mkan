"use client";

/**
 * Client-side query/mutation hooks for dashboard + property flows.
 *
 * Historically this module posted to a REST surface (`/properties`,
 * `/applications`, `/tenants/:id/*`) that was never implemented on the
 * server. Every call 404'd and every dashboard page rendered "Error
 * fetching…". This rewrite wires the same hook surface to the existing
 * `src/lib/actions/*` server actions — callers keep working unchanged.
 *
 * The thin `useQuery` / `useMutation` primitives below remain because
 * consumers depend on the `{ data, isLoading, isError, refetch }` shape.
 * Future work can migrate individual pages to direct server-action calls
 * with `useTransition` and drop this module entirely.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getAuthUser, getTenant, getCurrentResidences, getTenantLeases, getListingLeases, updateTenantSettings, updateManagerSettings, addFavoriteProperty, removeFavoriteProperty } from "@/lib/actions/user-actions";
import { getListing, getHostListings, createListing } from "@/lib/actions/listing-actions";
import { searchListings } from "@/lib/actions/search-actions";
import { getApplications, createApplication, updateApplicationStatus } from "@/lib/actions/application-actions";
import { getLeasePayments } from "@/lib/actions/payment-actions";

import { FiltersState } from "./filters";

// ─── Generic query hook ──────────────────────────────────────────────
interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: { skip?: boolean; errorToast?: string }
): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(!options?.skip);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    if (options?.skip) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setIsError(false);
    setError(null);

    fetcherRef
      .current()
      .then((result) => {
        if (mountedRef.current) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err);
          setIsError(true);
          setIsLoading(false);
          if (options?.errorToast) {
            toast.error(options.errorToast);
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.skip, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    run();
    return () => {
      mountedRef.current = false;
    };
  }, [run]);

  return { data, isLoading, isError, error, refetch: run };
}

// ─── Generic mutation hook ───────────────────────────────────────────
function useMutation<TArg, TResult>(
  mutationFn: (arg: TArg) => Promise<TResult>,
  options?: { successToast?: string; errorToast?: string }
): [(arg: TArg) => Promise<TResult>, { isLoading: boolean }] {
  const [isLoading, setIsLoading] = useState(false);

  const trigger = useCallback(
    async (arg: TArg) => {
      setIsLoading(true);
      try {
        const result = await mutationFn(arg);
        if (options?.successToast) toast.success(options.successToast);
        return result;
      } catch (err) {
        if (options?.errorToast) toast.error(options.errorToast);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return [trigger, { isLoading }];
}

// ─── Auth user ───────────────────────────────────────────────────────
export function useGetAuthUserQuery() {
  return useQuery(
    () => getAuthUser(),
    [],
    { errorToast: "Could not fetch user data" }
  );
}

// ─── Properties / Listings ───────────────────────────────────────────

// `FiltersState` stores beds/baths/propertyType as strings with "any" as the
// sentinel for "no filter". The server action expects numbers / enum values,
// so map the store shape into the server shape here.
function toServerFilters(
  filters: Partial<FiltersState>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (filters.location) out.location = filters.location;
  if (filters.priceRange?.[0] != null) out.priceMin = filters.priceRange[0];
  if (filters.priceRange?.[1] != null) out.priceMax = filters.priceRange[1];
  if (filters.beds && filters.beds !== "any") {
    const n = Number(filters.beds);
    if (!Number.isNaN(n)) out.beds = n;
  }
  if (filters.baths && filters.baths !== "any") {
    const n = Number(filters.baths);
    if (!Number.isNaN(n)) out.baths = n;
  }
  if (filters.propertyType && filters.propertyType !== "any") {
    out.propertyType = filters.propertyType;
  }
  if (filters.amenities && filters.amenities.length > 0) {
    out.amenities = filters.amenities;
  }
  return out;
}

export function useGetPropertiesQuery(
  filters: Partial<FiltersState> & { favoriteIds?: number[] },
  options?: { skip?: boolean }
) {
  return useQuery(
    async () => {
      const res = await searchListings(toServerFilters(filters) as Parameters<typeof searchListings>[0]);
      return res.success ? res.data : [];
    },
    [JSON.stringify(filters)],
    { skip: options?.skip, errorToast: "Failed to fetch properties." }
  );
}

export function useGetPropertyQuery(id: number, options?: { skip?: boolean }) {
  return useQuery(
    () => getListing(id),
    [id],
    { skip: options?.skip, errorToast: "Failed to load property details." }
  );
}

// ─── Tenants ─────────────────────────────────────────────────────────
export function useGetTenantQuery(
  userId: string,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getTenant(userId),
    [userId],
    { skip: options?.skip, errorToast: "Failed to load tenant profile." }
  );
}

export function useGetCurrentResidencesQuery(
  userId: string,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getCurrentResidences(userId),
    [userId],
    {
      skip: options?.skip,
      errorToast: "Failed to fetch current residences.",
    }
  );
}

export function useUpdateTenantSettingsMutation() {
  return useMutation(
    ({ userId, ...body }: { userId: string; name?: string; email?: string; phoneNumber?: string }) =>
      updateTenantSettings(userId, body),
    {
      successToast: "Settings updated successfully!",
      errorToast: "Failed to update settings.",
    }
  );
}

export function useAddFavoritePropertyMutation() {
  return useMutation(
    ({ userId, propertyId }: { userId: string; propertyId: number }) =>
      addFavoriteProperty(userId, propertyId),
    {
      successToast: "Added to favorites!",
      errorToast: "Failed to add to favorites",
    }
  );
}

export function useRemoveFavoritePropertyMutation() {
  return useMutation(
    ({ userId, propertyId }: { userId: string; propertyId: number }) =>
      removeFavoriteProperty(userId, propertyId),
    {
      successToast: "Removed from favorites!",
      errorToast: "Failed to remove from favorites.",
    }
  );
}

// ─── Managers ────────────────────────────────────────────────────────
export function useGetManagerPropertiesQuery(
  userId: string,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getHostListings(userId),
    [userId],
    { skip: options?.skip, errorToast: "Failed to load manager listings." }
  );
}

export function useUpdateManagerSettingsMutation() {
  return useMutation(
    ({ userId, ...body }: { userId: string; name?: string; email?: string; username?: string }) =>
      updateManagerSettings(userId, body),
    {
      successToast: "Settings updated successfully!",
      errorToast: "Failed to update settings.",
    }
  );
}

export function useCreatePropertyMutation() {
  return useMutation(
    (formData: FormData) => {
      // Convert FormData into the shape expected by `createListing`. The
      // server action accepts a JSON payload; a FormData caller must map
      // its fields up-front.
      const data: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) {
        if (key === "photoUrls" && value instanceof File) continue;
        data[key] = value;
      }
      return createListing(data);
    },
    {
      successToast: "Property created successfully!",
      errorToast: "Failed to create property.",
    }
  );
}

// ─── Leases / Payments ───────────────────────────────────────────────
export function useGetLeasesQuery(
  userId?: string | number,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => {
      if (!userId || typeof userId !== "string") {
        return Promise.resolve([]);
      }
      return getTenantLeases(userId);
    },
    [userId],
    {
      skip: options?.skip,
      errorToast: "Failed to fetch leases.",
    }
  );
}

export function useGetPropertyLeasesQuery(
  propertyId: number,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getListingLeases(propertyId),
    [propertyId],
    { skip: options?.skip, errorToast: "Failed to fetch property leases." }
  );
}

export function useGetPaymentsQuery(
  leaseId: number,
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getLeasePayments(leaseId),
    [leaseId],
    { skip: options?.skip, errorToast: "Failed to fetch payment info." }
  );
}

// ─── Applications ────────────────────────────────────────────────────
export function useGetApplicationsQuery(
  params: { userId?: string; userType?: string },
  options?: { skip?: boolean }
) {
  return useQuery(
    () => getApplications(),
    [params.userId, params.userType],
    { skip: options?.skip, errorToast: "Failed to fetch applications." }
  );
}

export function useUpdateApplicationStatusMutation() {
  return useMutation(
    ({ id, status }: { id: number; status: string }) =>
      updateApplicationStatus(id, status),
    {
      successToast: "Application status updated successfully!",
      errorToast: "Failed to update application.",
    }
  );
}

export function useCreateApplicationMutation() {
  return useMutation(
    (body: {
      propertyId: number;
      name: string;
      email: string;
      phoneNumber: string;
      message?: string;
    }) => createApplication(body),
    {
      successToast: "Application created successfully!",
      errorToast: "Failed to create application.",
    }
  );
}
