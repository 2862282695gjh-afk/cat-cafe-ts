export function SkeletonScreen() {
  return (
    <div aria-hidden="true" role="presentation" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Training card skeleton */}
      <div className="duo-skeleton-card">
        <div className="duo-skeleton-header">
          <div className="duo-skeleton duo-skeleton-title" />
          <div style={{ display: "flex", gap: 8 }}>
            <div className="duo-skeleton duo-skeleton-badge" />
            <div className="duo-skeleton duo-skeleton-badge" />
          </div>
        </div>
        <div className="duo-skeleton duo-skeleton-progress" />
        {[0, 1, 2].map((i) => (
          <div className="duo-skeleton-row" key={i}>
            <div className="duo-skeleton duo-skeleton-circle" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
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
        <div className="duo-skeleton duo-skeleton-progress" style={{ width: "70%" }} />
        <div className="duo-skeleton-row">
          <div className="duo-skeleton duo-skeleton-circle" style={{ width: 24, height: 24, borderRadius: 8 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-long" />
          </div>
        </div>
        <div className="duo-skeleton-row">
          <div className="duo-skeleton duo-skeleton-circle" style={{ width: 24, height: 24, borderRadius: 8 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="duo-skeleton duo-skeleton-line duo-skeleton-line-long" />
          </div>
        </div>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        正在加载训练数据
      </span>
    </div>
  );
}
