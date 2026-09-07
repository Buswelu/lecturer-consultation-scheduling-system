import * as React from "react";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

const avatarVariants = cva(
  "flex shrink-0 overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        default: "h-10 w-10",
        sm: "h-8 w-8",
        lg: "h-16 w-16",
        xl: "h-24 w-24",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "default" | "sm" | "lg" | "xl";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size, ...props }, ref) => {
    const [hasError, setHasError] = React.useState(false);
    const fallbackText = fallback || (alt ? getInitials(alt) : "?");

    return (
      <div
        ref={ref}
        className={cn(
          avatarVariants({ size }),
          "relative flex items-center justify-center text-muted-foreground",
          className,
        )}
        {...props}
      >
        {src && !hasError ? (
          <img
            src={src}
            alt={alt ?? "avatar"}
            className="h-full w-full object-cover"
            onError={() => setHasError(true)}
          />
        ) : (
          <span className="text-sm font-medium">{fallbackText}</span>
        )}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar };
