"use client";
import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padded?: boolean;
}

export function Card({ children, className = "", hoverable, padded = true, ...rest }: CardProps) {
  return (
    <div
      className={`tsCard ${hoverable ? "tsCard-hover" : ""} ${padded ? "tsCard-padded" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
