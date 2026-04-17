import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-2xl border border-gray-200 bg-white", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between px-4 py-3.5", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-[15px] font-semibold text-[#4169e1]", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardMeta = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-sm text-gray-400", className)}
      {...props}
    />
  ),
);
CardMeta.displayName = "CardMeta";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 pb-4", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("h-px bg-gray-100", className)}
      {...props}
    />
  ),
);
CardSeparator.displayName = "CardSeparator";

const CardFootnote = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("px-4 pb-4 pt-0 text-xs text-gray-400 leading-relaxed", className)}
      {...props}
    />
  ),
);
CardFootnote.displayName = "CardFootnote";

export { Card, CardHeader, CardTitle, CardMeta, CardContent, CardSeparator, CardFootnote };
