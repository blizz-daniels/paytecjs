"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import type { NavigationItem } from "@/lib/server/navigation";

type AppShellProps = {
  brandCopy: string;
  navigation: NavigationItem[];
  children: ReactNode;
};

function isActivePath(pathname: string, item: NavigationItem) {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({ brandCopy, navigation, children }: AppShellProps) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const navItems = useMemo(
    () =>
      navigation.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isActivePath(pathname, item) ? "active" : undefined}
        >
          <img className="nav-link__icon" src={item.icon} alt="" aria-hidden="true" />
          {item.label}
        </Link>
      )),
    [navigation, pathname]
  );

  return (
    <>
      <header className="topbar">
        <BrandMark copy={brandCopy} />
        <button
          id="menuButton"
          className="menu-btn"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          type="button"
          onClick={() => setNavOpen((value) => !value)}
        >
          &#9776;
        </button>
        <nav id="mainNav" className={navOpen ? "nav-links open" : "nav-links"}>
          {navItems}
          <form method="post" action="/api/auth/logout" className="logout-form">
            <button type="submit" className="logout-btn">
              Log out
            </button>
          </form>
        </nav>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
