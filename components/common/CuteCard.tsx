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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover ? { y: -3, scale: 1.005 } : undefined}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "rounded-[1.4rem] border border-white/80 bg-white/82 p-5 shadow-[0_18px_50px_rgba(118,139,172,0.16)] backdrop-blur",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
