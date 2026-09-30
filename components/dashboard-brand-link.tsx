import Link from "next/link";

export function DashboardBrandLink() {
  return (
    <Link
      href="/"
      aria-label="LeadFlow Dashboard – Áttekintés"
      className="accent-text inline-block font-semibold hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      LeadFlow
    </Link>
  );
}
