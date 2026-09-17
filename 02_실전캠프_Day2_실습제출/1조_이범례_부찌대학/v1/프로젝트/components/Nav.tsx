"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/hall", label: "홀 매장" },
  { href: "/delivery", label: "배달 매장" },
  { href: "/", label: "정산" },
  { href: "/staff", label: "직원 명단" },
  { href: "/settings", label: "설정" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <Link href="/" className="mr-2 whitespace-nowrap text-base font-bold">
          근무·급여 <span className="text-accent">원터치</span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {MENU.map((m) => {
            const active = path === m.href;
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-ink text-surface" : "text-muted hover:bg-bg"
                }`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
