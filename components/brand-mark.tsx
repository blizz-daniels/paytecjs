import type { ReactNode } from "react";

type BrandMarkProps = {
  copy?: ReactNode;
  centered?: boolean;
};

export function BrandMark({ copy = "Da4lions Pay-tec", centered = false }: BrandMarkProps) {
  return (
    <div
      className="brand brand-mark"
      style={centered ? { justifyContent: "center", marginBottom: "0.65rem" } : undefined}
    >
      <img src="/assets/da4lions-logo.jpeg" alt="Da4lions Pay-tec logo" className="brand-logo" />
      <span className="brand-copy">{copy}</span>
    </div>
  );
}
