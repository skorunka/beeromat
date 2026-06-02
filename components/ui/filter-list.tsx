'use client';

import { useState, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';

// Generic client-side search filter for a server-rendered list. The
// server renders each row (including any client children, e.g. an
// actions menu) and passes it as `node` alongside a plain `searchText`
// to match against — so the page stays a server component and only the
// filter is interactive. The search box shows once the list is big
// enough to be worth filtering.

interface FilterListItem {
  key: string;
  searchText: string;
  node: ReactNode;
}

interface FilterListProps {
  items: FilterListItem[];
  placeholder: string;
  emptyText: string;
  /** Min item count before the search box appears. */
  threshold?: number;
}

export function FilterList({ items, placeholder, emptyText, threshold = 8 }: FilterListProps) {
  const [query, setQuery] = useState('');
  const showSearch = items.length >= threshold;
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.searchText.toLowerCase().includes(q)) : items;

  return (
    <div className="flex flex-col gap-2">
      {showSearch ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      ) : null}
      <ul className="flex flex-col gap-2">
        {filtered.map((i) => (
          <li key={i.key}>{i.node}</li>
        ))}
      </ul>
      {showSearch && filtered.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{emptyText}</p>
      ) : null}
    </div>
  );
}
