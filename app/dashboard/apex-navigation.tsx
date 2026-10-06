import Link from "next/link";
import { signOut } from "../login/actions";

export const APEX_TABS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "sales", label: "Sales", href: "/sales" },
  {
    key: "benefits",
    label: "Benefits",
    href: "/dashboard/records/benefits",
  },
  {
    key: "operational",
    label: "Operational Expenses",
    href: "/expenses?type=operational",
  },
  {
    key: "capital",
    label: "Capital Expenses",
    href: "/expenses?type=capital",
  },
  {
    key: "salaries",
    label: "Salaries",
    href: "/dashboard/records/salaries",
  },
  {
    key: "incentives",
    label: "Incentives",
    href: "/dashboard/records/incentives",
  },
  {
    key: "cash-advance",
    label: "Cash Advance",
    href: "/dashboard/records/cash-advance",
  },
];

export default function ApexNavigation({
  active,
  fullName,
  role,
}: {
  active: string;
  fullName: string;
  role: string;
}) {
  return (
    <aside className="apex-sidebar">
      <div className="px-3">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#8a6309]">
          APEX workspace
        </p>

        <h2 className="mt-2 text-2xl font-semibold text-[#082451]">
          Business management
        </h2>
      </div>

      <nav
        aria-label="Business navigation"
        className="mt-6 flex flex-col gap-2"
      >
        {APEX_TABS.map((tab, index) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-lg font-medium transition ${
              active === tab.key
                ? "bg-[#082451] text-white shadow-sm"
                : "text-[#52647d] hover:bg-[#edf2f9] hover:text-[#082451]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                active === tab.key
                  ? "bg-white/15 text-[#f2b72f]"
                  : "bg-[#edf2f9] text-[#52647d]"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>

            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 rounded-2xl border border-[#e7d39c] bg-[#fff8e8] p-5">
        <p className="font-semibold text-[#082451]">
          {fullName}
        </p>

        <p className="mt-1 text-base capitalize text-[#52647d]">
          {role}
        </p>

        <form
          action={signOut}
          className="mt-5 border-t border-[#e7d39c] pt-4"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3 text-lg font-semibold text-[#082451] transition hover:border-[#082451] hover:bg-[#edf2f9]"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>

            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}