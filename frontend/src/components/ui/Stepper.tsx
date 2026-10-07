export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const progress = (current / steps.length) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <p className="text-textMuted">
          Step {current} of {steps.length}
        </p>
        <p className="font-medium">{steps[current - 1]}</p>
      </div>
      <div className="h-2 rounded-full bg-panel2" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={steps.length} aria-label="Onboarding progress">
        <div className="h-2 rounded-full bg-info" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
