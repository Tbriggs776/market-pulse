/**
 * NewsCardSkeleton — loading placeholder that matches NewsCard's shape.
 * Shown while the news query is pending so layout doesn't shift on load.
 */
export default function NewsCardSkeleton() {
  return (
    <div className="card flex flex-col animate-pulse">
      <div className="-mx-5 -mt-5 mb-4 aspect-video bg-surface-elevated rounded-t-lg" />
      <div className="h-3 bg-surface-elevated rounded w-24 mb-3" />
      <div className="h-4 bg-surface-elevated rounded w-full mb-2" />
      <div className="h-4 bg-surface-elevated rounded w-5/6 mb-4" />
      <div className="h-3 bg-surface-elevated rounded w-full mb-1" />
      <div className="h-3 bg-surface-elevated rounded w-4/6 mb-4" />
      <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
        <div className="h-5 bg-surface-elevated rounded w-16" />
        <div className="h-3 bg-surface-elevated rounded w-12" />
      </div>
    </div>
  )
}