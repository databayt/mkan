"use client";

import { cleanParams, createNewUserInDatabase, withToast } from "@/lib/utils";
import {
  Application,
  Lease,
  Manager,
  Payment,
  Property,
  Tenant,
} from "@/types/prismaTypes";
import { ApplicationWithDetails } from "@/components/application/action";
import { getSession } from "next-auth/react";
import { FiltersState } from "./filters";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Base fetch helper ───────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const session = await getSession();
  const headers = new Headers(options?.headers);

  if (session?.user) {
    const token = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        role: session.user.role,
        email: session.user.email,
      })
    ).toString("base64");
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !(options?.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}/${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw Object.assign(new Error(errorBody || res.statusText), {
      status: res.status,
    });
  }

  return res.json() as Promise<T>;
}

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
interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
  isTwoFactorEnabled: boolean;
  isOAuth: boolean;
  userInfo: Tenant | Manager;
  userRole: string;
}

export function useGetAuthUserQuery() {
  return useQuery<User>(
    async () => {
      const session = await getSession();
      if (!session?.user) throw new Error("No authenticated user found");

      const user = session.user;
      const userRole = user.role?.toLowerCase() || "user";
      const endpoint =
        userRole === "manager"
          ? `managers/${user.id}`
          : `tenants/${user.id}`;

      let userDetails: Tenant | Manager;
      try {
        userDetails = await apiFetch(endpoint);
      } catch (err: any) {
        if (err.status === 404) {
          const createEndpoint =
            userRole === "manager" ? "managers" : "tenants";
          userDetails = await apiFetch(createEndpoint, {
            method: "POST",
            body: JSON.stringify({
              cognitoId: user.id,
              name: user.name || user.email?.split("@")[0] || "",
              email: user.email || "",
              phoneNumber: "",
            }),
          });
        } else {
          throw err;
        }
      }

      return {
        id: user.id!,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        role: user.role ?? null,
        isTwoFactorEnabled: user.isTwoFactorEnabled ?? false,
        isOAuth: user.isOAuth ?? false,
        userInfo: userDetails,
        userRole,
      };
    },
    [],
    { errorToast: "Could not fetch user data" }
  );
}

// ─── Properties ──────────────────────────────────────────────────────
export function useGetPropertiesQuery(
  filters: Partial<FiltersState> & { favoriteIds?: number[] },
  options?: { skip?: boolean }
) {
  return useQuery<Property[]>(
    () => {
      const params = cleanParams({
        location: filters.location,
        priceMin: filters.priceRange?.[0],
        priceMax: filters.priceRange?.[1],
        beds: filters.beds,
        baths: filters.baths,
        propertyType: filters.propertyType,
        squareFeetMin: filters.squareFeet?.[0],
        squareFeetMax: filters.squareFeet?.[1],
        amenities: filters.amenities?.join(","),
        availableFrom: filters.availableFrom,
        favoriteIds: filters.favoriteIds?.join(","),
        latitude: filters.coordinates?.[1],
        longitude: filters.coordinates?.[0],
      });
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString();
      return apiFetch<Property[]>(`properties${qs ? `?${qs}` : ""}`);
    },
    [JSON.stringify(filters)],
    { skip: options?.skip, errorToast: "Failed to fetch properties." }
  );
}

export function useGetPropertyQuery(id: number, options?: { skip?: boolean }) {
  return useQuery<Property>(
    () => apiFetch<Property>(`properties/${id}`),
    [id],
    { skip: options?.skip, errorToast: "Failed to load property details." }
  );
}

// ─── Tenants ─────────────────────────────────────────────────────────
export function useGetTenantQuery(
  userId: string,
  options?: { skip?: boolean }
) {
  return useQuery<Tenant>(
    () => apiFetch<Tenant>(`tenants/${userId}`),
    [userId],
    { skip: options?.skip, errorToast: "Failed to load tenant profile." }
  );
}

export function useGetCurrentResidencesQuery(
  userId: string,
  options?: { skip?: boolean }
) {
  return useQuery<Property[]>(
    () => apiFetch<Property[]>(`tenants/${userId}/current-residences`),
    [userId],
    {
      skip: options?.skip,
      errorToast: "Failed to fetch current residences.",
    }
  );
}

export function useUpdateTenantSettingsMutation() {
  return useMutation<{ userId: string } & Partial<Tenant>, Tenant>(
    ({ userId, ...body }) =>
      apiFetch<Tenant>(`tenants/${userId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    {
      successToast: "Settings updated successfully!",
      errorToast: "Failed to update settings.",
    }
  );
}

export function useAddFavoritePropertyMutation() {
  return useMutation<{ userId: string; propertyId: number }, Tenant>(
    ({ userId, propertyId }) =>
      apiFetch<Tenant>(`tenants/${userId}/favorites/${propertyId}`, {
        method: "POST",
      }),
    {
      successToast: "Added to favorites!!",
      errorToast: "Failed to add to favorites",
    }
  );
}

export function useRemoveFavoritePropertyMutation() {
  return useMutation<{ userId: string; propertyId: number }, Tenant>(
    ({ userId, propertyId }) =>
      apiFetch<Tenant>(`tenants/${userId}/favorites/${propertyId}`, {
        method: "DELETE",
      }),
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
  return useQuery<Property[]>(
    () => apiFetch<Property[]>(`managers/${userId}/properties`),
    [userId],
    { skip: options?.skip, errorToast: "Failed to load manager profile." }
  );
}

export function useUpdateManagerSettingsMutation() {
  return useMutation<{ userId: string } & Partial<Manager>, Manager>(
    ({ userId, ...body }) =>
      apiFetch<Manager>(`managers/${userId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    {
      successToast: "Settings updated successfully!",
      errorToast: "Failed to update settings.",
    }
  );
}

export function useCreatePropertyMutation() {
  return useMutation<FormData, Property>(
    (formData) =>
      apiFetch<Property>("properties", {
        method: "POST",
        body: formData,
      }),
    {
      successToast: "Property created successfully!",
      errorToast: "Failed to create property.",
    }
  );
}

// ─── Leases ──────────────────────────────────────────────────────────
export function useGetLeasesQuery(
  _?: number,
  options?: { skip?: boolean }
) {
  return useQuery<Lease[]>(() => apiFetch<Lease[]>("leases"), [_], {
    skip: options?.skip,
    errorToast: "Failed to fetch leases.",
  });
}

export function useGetPropertyLeasesQuery(
  propertyId: number,
  options?: { skip?: boolean }
) {
  return useQuery<Lease[]>(
    () => apiFetch<Lease[]>(`properties/${propertyId}/leases`),
    [propertyId],
    { skip: options?.skip, errorToast: "Failed to fetch property leases." }
  );
}

export function useGetPaymentsQuery(
  leaseId: number,
  options?: { skip?: boolean }
) {
  return useQuery<Payment[]>(
    () => apiFetch<Payment[]>(`leases/${leaseId}/payments`),
    [leaseId],
    { skip: options?.skip, errorToast: "Failed to fetch payment info." }
  );
}

// ─── Applications ────────────────────────────────────────────────────
export function useGetApplicationsQuery(
  params: { userId?: string; userType?: string },
  options?: { skip?: boolean }
) {
  return useQuery<ApplicationWithDetails[]>(
    () => {
      const qs = new URLSearchParams();
      if (params.userId) qs.append("userId", params.userId);
      if (params.userType) qs.append("userType", params.userType);
      return apiFetch<ApplicationWithDetails[]>(
        `applications?${qs.toString()}`
      );
    },
    [params.userId, params.userType],
    { skip: options?.skip, errorToast: "Failed to fetch applications." }
  );
}

export function useUpdateApplicationStatusMutation() {
  return useMutation<
    { id: number; status: string },
    Application & { lease?: Lease }
  >(
    ({ id, status }) =>
      apiFetch<Application & { lease?: Lease }>(
        `applications/${id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status }),
        }
      ),
    {
      successToast: "Application status updated successfully!",
      errorToast: "Failed to update application settings.",
    }
  );
}

export function useCreateApplicationMutation() {
  return useMutation<Partial<Application>, Application>(
    (body) =>
      apiFetch<Application>("applications", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    {
      successToast: "Application created successfully!",
      errorToast: "Failed to create applications.",
    }
  );
}
