// Decorative route-loading placeholder (US8). Purely visual — no text,
// so it needs no localization; aria-hidden keeps it out of the a11y tree.

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <main className="mx-auto max-w-2xl p-4" aria-hidden>
      <div className="bg-muted mb-4 h-7 w-44 animate-pulse rounded" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
        ))}
      </div>
    </main>
  );
}
