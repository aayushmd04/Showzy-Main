import { Link } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { usePageMeta } from "@/lib/use-meta";

export function NotFoundScreen() {
  usePageMeta({ title: "Page not found", description: "That page does not exist on Showzy." });
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-4 py-24 text-center">
        <p className="t-micro">404</p>
        <h1 className="t-display mt-3">That page isn't on tonight</h1>
        <p className="t-body mt-3 text-muted">
          The link may be old, or the event was taken down.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          Find something on
        </Link>
      </div>
    </PublicShell>
  );
}
