import { Card } from "./Card";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      <p className="max-w-xl text-sm text-textMuted">{body}</p>
      {action}
    </Card>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-dangerBorder bg-dangerBg p-5">
      <h2 className="font-display text-lg font-medium text-dangerText">Something failed</h2>
      <p className="mt-1 text-sm text-text">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-11 items-center rounded-control bg-text px-4 text-sm font-medium text-bg">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-panel2 ${className}`} />;
}
