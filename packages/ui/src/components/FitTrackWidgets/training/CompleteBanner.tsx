import { memo } from "react";

interface CompleteBannerProps {
  xp: number;
}

export const CompleteBanner = memo(function CompleteBanner({ xp }: CompleteBannerProps) {
  return (
    <div className="duo-complete-banner">
      <span className="duo-particle" />
      <span className="duo-particle" />
      <span className="duo-particle" />
      <span className="duo-particle" />
      <span className="duo-particle" />
      <span className="duo-particle" />
      <span>🎉</span>
      <span>太棒了！今日训练全部完成！</span>
      <span>+{xp} XP</span>
    </div>
  );
});
