import { buttonClass, cn } from "@/lib/utils";

type Variant = keyof typeof buttonClass;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={cn(buttonClass[variant], className)} {...props} />;
}
