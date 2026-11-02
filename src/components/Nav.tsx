"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Kalendarz" },
  { href: "/nowy", label: "Nowy post" },
  { href: "/posty", label: "Posty" },
  { href: "/konta", label: "Konta" },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
