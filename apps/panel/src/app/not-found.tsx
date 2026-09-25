import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="app-shell grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-6xl font-bold text-brand-soft">404</p>
        <h1 className="mt-4 text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">
          <Home className="size-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
