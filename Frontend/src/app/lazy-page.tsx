import { lazy, Suspense, type ComponentType } from "react";
import { PageLoader } from "@/components/common/page-loader";

export function lazyPage<T extends { [key: string]: ComponentType }>(
  factory: () => Promise<T>,
  named: keyof T,
) {
  const LazyComponent = lazy(() => factory().then((module) => ({ default: module[named] })));
  return (
    <Suspense fallback={<PageLoader />}>
      <LazyComponent />
    </Suspense>
  );
}
