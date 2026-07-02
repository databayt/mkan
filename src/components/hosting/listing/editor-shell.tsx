"use client";

/**
 * Editor two-pane shell with Airbnb-style mobile drill-in.
 *
 * Desktop (lg+): sections sidebar + section content side by side (unchanged).
 * Mobile: ONE pane at a time — entering the editor shows the sections list
 * full-screen; tapping a section slides to its content with a back arrow
 * returning to the list (the Airbnb host-app pattern). Pane state lives here;
 * the sidebar flips to the content pane via useEditorPane() so re-tapping the
 * already-active section still drills in.
 */

import React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { ChevronLeftIcon } from "@/components/hosting/listing/editor-icons";

type Pane = "nav" | "content";

const EditorPaneContext = React.createContext<{
  openContent: () => void;
  openNav: () => void;
}>({ openContent: () => {}, openNav: () => {} });

export function useEditorPane() {
  return React.useContext(EditorPaneContext);
}

export function EditorShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const dict = useDictionary();
  const backLabel =
    (dict?.listingEditor?.nav as Record<string, string> | undefined)?.listingEditor ??
    "Listing editor";
  const [pane, setPane] = React.useState<Pane>("nav");
  const prevPath = React.useRef(pathname);

  // Any section navigation (sidebar tap, deep link change) opens the content
  // pane on mobile; desktop ignores pane entirely via lg: classes.
  React.useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setPane("content");
      window.scrollTo({ top: 0 });
    }
  }, [pathname]);

  const value = React.useMemo(
    () => ({
      openContent: () => {
        setPane("content");
        window.scrollTo({ top: 0 });
      },
      openNav: () => {
        setPane("nav");
        window.scrollTo({ top: 0 });
      },
    }),
    []
  );

  return (
    <EditorPaneContext.Provider value={value}>
      <div className="mx-auto max-w-7xl py-4">
        <div className="flex flex-col lg:flex-row lg:gap-12">
          <aside
            className={cn(
              "w-full lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)] lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:pe-1",
              pane === "content" && "hidden"
            )}
          >
            {sidebar}
          </aside>
          <main
            className={cn(
              "min-w-0 flex-1 lg:block lg:pt-2",
              pane === "nav" && "hidden"
            )}
          >
            {/* Mobile-only back to the sections list (Airbnb drill-in) */}
            <button
              type="button"
              onClick={value.openNav}
              aria-label={backLabel}
              className="-ms-2 mb-4 flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted lg:hidden"
            >
              <ChevronLeftIcon size={16} className="rtl:rotate-180" />
            </button>
            {children}
          </main>
        </div>
      </div>
    </EditorPaneContext.Provider>
  );
}
