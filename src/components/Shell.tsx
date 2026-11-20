import Link from 'next/link';
import type { ReactNode } from 'react';

import type { User } from '@/lib/db/schema';

const NAV = [
  { href: '/repos', label: 'Repositories' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/rules', label: 'Rules' },
  { href: '/settings', label: 'Settings' }
];

export function Shell({ user, active, children }: { user: User; active: string; children: ReactNode }) {
  return (
    <>
      <header className="bg-steel text-white border-b-[3px] border-signal">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
          <Link href="/repos" className="text-[1.45rem] font-extrabold tracking-tight text-white hover:no-underline">
            Bridge
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? 'page' : undefined}
                className={`font-semibold text-white/80 hover:text-white hover:no-underline ${
                  active === item.href ? 'text-white underline decoration-signal decoration-2 underline-offset-[6px]' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" width={24} height={24} className="rounded-full" />
            ) : null}
            <span className="text-white/85">{user.login}</span>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="cursor-pointer text-white/70 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </>
  );
}
