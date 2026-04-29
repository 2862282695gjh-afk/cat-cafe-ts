export function SkeletonScreen() {
  return (
    <div className="duo-skeleton-wrapper" aria-hidden="true" role="presentation">
      {/* Training card skeleton */}
      <div className="duo-skeleton-card">
        <div className="duo-skeleton-header">
          <div className="duo-skeleton duo-skeleton-title" />
          <div className="duo-skeleton-badges">
            <div className="duo-skeleton duo-skeleton-badge" />
            <div className="duo-skeleton duo-skeleton-badge" />
          </div>
        </div>
        <div className="duo-skeleton duo-skeleton-progress" />
        {[0, 1, 2].map((i) => (
          <div className="duo-skeleton-row" key={i}>
            <div className="duo-skeleton duo-skeleton-circle" />
            <div className="duo-skeleton-col">
              <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-long" />
              <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-short" />
            </div>
            <div className="duo-skeleton duo-skeleton-check" />
          </div>
        ))}
      </div>

      {/* Nutrition card skeleton */}
      <div className="duo-skeleton-card">
        <div className="duo-skeleton duo-skeleton-title" />
        <div className="duo-skeleton duo-skeleton-progress duo-skeleton-progress-short" />
        <div className="duo-skeleton-row">
          <div className="duo-skeleton duo-skeleton-circle duo-skeleton-circle-sm" />
          <div className="duo-skeleton-col">
            <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-long" />
          </div>
        </div>
        <div className="duo-skeleton-row">
          <div className="duo-skeleton duo-skeleton-circle duo-skeleton-circle-sm" />
          <div className="duo-skeleton-col">
            <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-long" />
          </div>
        </div>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only duo-skeleton-sr-only" aria-live="polite">
        正在加载训练数据
      </span>
    </div>
  );
}
