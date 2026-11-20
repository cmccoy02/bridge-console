import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      <h1>Not found</h1>
      <p className="mt-3 text-slate">
        This page doesn&apos;t exist, or it belongs to an account you can&apos;t see. <Link href="/repos">Go to your repositories</Link>.
      </p>
    </main>
  );
}
