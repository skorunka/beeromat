// Decorative route-loading placeholder (US8). Purely visual — no text,
// so it needs no localization; aria-hidden keeps it out of the a11y tree.
//
// Width matches the dominant authenticated-page width (max-w-md, same
// as home + /tab + /account). Admin routes (max-w-2xl) get their own
// loading.tsx wrappers if they need wider skeletons.

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <main className="mx-auto max-w-md p-5" aria-hidden>
      <div className="bg-muted mb-4 h-7 w-44 animate-pulse rounded" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
        ))}
      </div>
    </main>
  );
}
