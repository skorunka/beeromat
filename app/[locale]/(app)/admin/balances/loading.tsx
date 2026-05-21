import { ListSkeleton } from '@/components/loading-skeleton';

// US8 — the all-members balance overview is DB-heavy.
export default function Loading() {
  return <ListSkeleton rows={6} />;
}
