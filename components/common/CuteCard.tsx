"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type CuteCardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function CuteCard({ children, className, hover = false }: CuteCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs",
        hover && "transition-shadow hover:shadow-md",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
