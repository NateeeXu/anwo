// Suspense fallback used by the router while a lazy page chunk loads.
import { Skeleton } from '../components';

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-6 lg:px-8" aria-busy="true">
      <Skeleton variant="text" width={240} height={28} />
      <div className="mt-2">
        <Skeleton variant="text" width={360} />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        <Skeleton variant="listing-card" />
        <Skeleton variant="listing-card" />
        <Skeleton variant="listing-card" />
        <Skeleton variant="listing-card" />
      </div>
    </div>
  );
}

export default PageSkeleton;
