"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { getMyFavoriteIds, toggleFavorite } from "@/lib/actions/favorite-actions";

/**
 * One favorites source of truth for every heart in the app (cards, mobile
 * detail, desktop detail). Signed-in users persist to the tenant's favorites
 * via the toggle action (which upserts the Tenant row); guests keep a
 * device-level list in localStorage — phase 1 is contact-only, so we don't
 * force a login just to remember a home.
 */

const GUEST_KEY = "mkan:favorites";

interface FavoritesContextValue {
  ready: boolean;
  isFavorite: (id: number | string) => boolean;
  toggle: (id: number | string) => void;
}

const FavoritesContext = React.createContext<FavoritesContextValue>({
  ready: false,
  isFavorite: () => false,
  toggle: () => {},
});

function readGuestIds(): number[] {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function writeGuestIds(ids: Set<number>): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / quota — favorites just won't persist on-device.
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [ids, setIds] = React.useState<Set<number>>(new Set());
  const [ready, setReady] = React.useState(false);
  const authed = status === "authenticated";

  React.useEffect(() => {
    let cancelled = false;
    if (status === "loading") return;
    if (authed) {
      getMyFavoriteIds()
        .then((server) => {
          if (cancelled) return;
          setIds(new Set(server));
          setReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          setReady(true);
        });
    } else {
      setIds(new Set(readGuestIds()));
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, [authed, status]);

  const isFavorite = React.useCallback(
    (id: number | string) => ids.has(Number(id)),
    [ids]
  );

  const toggle = React.useCallback(
    (rawId: number | string) => {
      const id = Number(rawId);
      if (!Number.isFinite(id)) return;

      // Optimistic flip — the heart must respond on the tap, not the network.
      setIds((prev) => {
        const next = new Set(prev);
        const nowFav = !next.has(id);
        if (nowFav) next.add(id);
        else next.delete(id);
        if (!authed) writeGuestIds(next);
        return next;
      });

      if (authed) {
        toggleFavorite(id).then((res) => {
          if (!res.ok) {
            // Server disagreed — roll the optimistic flip back.
            setIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }
        });
      }
    },
    [authed]
  );

  const value = React.useMemo(
    () => ({ ready, isFavorite, toggle }),
    [ready, isFavorite, toggle]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  return React.useContext(FavoritesContext);
}
