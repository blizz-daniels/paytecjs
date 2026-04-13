import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

type AuthShellProps = {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  notice?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer, notice }: AuthShellProps) {
  return (
    <main className="container auth-shell">
      <section className="card auth-card">
        <BrandMark centered />
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {notice ? <p className="auth-error">{notice}</p> : null}
        {children}
        {footer ? <p className="auth-help">{footer}</p> : null}
      </section>
    </main>
  );
}
