import { ListSkeleton } from '@/components/loading-skeleton';

// US8 — cross-session history can be a long list.
export default function Loading() {
  return <ListSkeleton rows={6} />;
}
