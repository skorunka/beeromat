import { ListSkeleton } from '@/components/loading-skeleton';

// US8 — the treasurer pending queue is DB-heavy; show a longer list.
export default function Loading() {
  return <ListSkeleton rows={6} />;
}
