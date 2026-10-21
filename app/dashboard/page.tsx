import { canViewDashboard } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import ApexNavigation from "./apex-navigation";
import DashboardCharts from "./dashboard-charts";
import DailyReportPanel from "./daily-report";
import {
  BANKS,
  MONTHS,
  loadDashboard,
  manilaToday,
  pesos,
} from "./dashboard-data";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

function Stat({
  label,
  amount,
  gold = false,
}: {
  label: string;
  amount: number | null;
  gold?: boolean;
}) {
  return (
    <article className={`apex-stat ${gold ? "apex-stat-gold" : ""}`}>
      <p className="text-lg font-medium leading-7 text-[#52647d]">
        {label}
      </p>
      <p
        className={`mt-4 wrap-break-word text-3xl font-semibold tracking-tight tabular-nums ${
          amount !== null && amount < 0
            ? "text-[#b42318]"
            : "text-[#082451]"
        }`}
      >
        {amount === null ? "—" : pesos(amount)}
      </p>
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();

  if (!auth?.claims?.sub) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", auth.claims.sub)
    .single();

  if (error || !profile || !canViewDashboard(profile.role)) redirect("/login");

  const today = manilaToday();
  const currentYear = Number(today.slice(0, 4));
  const params = await searchParams;
  const requestedYear = Number(params.year);

  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2026 &&
    requestedYear <= currentYear + 5
      ? requestedYear
      : currentYear;

  const monthName = MONTHS.includes(params.month ?? "")
    ? params.month!
    : "ALL MONTHS";

  const monthNumber = MONTHS.indexOf(monthName) + 1;
  const data = await loadDashboard(supabase, year, monthNumber);
  const summary = data.summary;

  const years = Array.from(
    { length: currentYear + 5 - 2026 + 1 },
    (_, index) => 2026 + index,
  );

  const period =
    monthNumber === 0
      ? `All months · ${year}`
      : `${monthName.charAt(0)}${monthName.slice(1).toLowerCase()} · ${year}`;

  function funds(start: number, end: number) {
    const months = data.monthly.slice(start, end);

    return months.some((entry) => entry.active)
      ? months.reduce((total, entry) => total + entry.profit, 0)
      : null;
  }

  function deductions(start: number, end: number) {
    const months = data.monthly.slice(start, end);

    return months.some((entry) => entry.active)
      ? months.reduce(
          (total, entry) =>
            total + entry.profitSales - entry.profit,
          0,
        )
      : null;
  }

  function halfSales(start: number, end: number) {
    const months = data.monthly.slice(start, end);

    return months.some((entry) => entry.sales !== 0)
      ? months.reduce((total, entry) => total + entry.sales, 0)
      : null;
  }

  const operatingCards = [
    ["Total sales", summary.totalSales],
    ["Down payment", summary.downPayment],
    ["Full payment", summary.fullPayment],
    ["Operational expenses", summary.operational],
    ["Capital expenses", summary.capital],
    ["Salaries", summary.salaries],
    ["Commission", summary.commission],
    ["Incentives", summary.incentives],
  ] as const;

  return (
    <main className="relative isolate min-h-screen text-lg text-[#102448]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/images/apex-solar-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_center]"
        />
        <div className="absolute inset-0 bg-[#f5f7fb]/90" />
      </div>

      <div className="apex-workspace">
        <ApexNavigation
          active="dashboard"
          fullName={profile.full_name || "APEX team"}
          role={profile.role}
        />

        <div className="apex-content">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8a6309]">
                Business overview
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#082451] md:text-5xl">
                Dashboard
              </h1>
              <p className="mt-3 text-xl text-[#52647d]">
                Welcome, {profile.full_name || "APEX team"}.
              </p>
            </div>

            <span className="rounded-full border border-[#dce4ef] bg-white px-5 py-3 text-base font-semibold capitalize">
              {profile.role}
            </span>
          </header>

          <section className="apex-panel">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-[#52647d]">
                  Selected period
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{period}</h2>
              </div>

              <form
                key={`${year}-${monthName}`}
                action="/dashboard"
                method="get"
                className="flex flex-wrap items-end gap-3"
              >
                <label className="text-base font-semibold text-[#52647d]">
                  Year
                  <select
                    name="year"
                    defaultValue={year}
                    className="apex-control mt-2"
                  >
                    {years.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label className="text-base font-semibold text-[#52647d]">
                  Month
                  <select
                    name="month"
                    defaultValue={monthName}
                    className="apex-control mt-2"
                  >
                    <option value="ALL MONTHS">All months</option>
                    {MONTHS.map((value) => (
                      <option key={value} value={value}>
                        {value.charAt(0) + value.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-xl bg-[#f2b72f] px-6 py-3 font-bold text-[#082451] hover:bg-[#e5a71c]"
                >
                  Apply
                </button>
              </form>
            </div>

            <nav
              aria-label="Select dashboard month"
              className="mt-6 flex flex-wrap gap-2 border-t border-[#dce4ef] pt-5"
            >
              {["ALL MONTHS", ...MONTHS].map((value) => (
                <Link
                  key={value}
                  href={{
                    pathname: "/dashboard",
                    query: { year, month: value },
                  }}
                  aria-current={monthName === value ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-base font-semibold ${
                    monthName === value
                      ? "bg-[#082451] text-white"
                      : "bg-[#edf2f9] text-[#52647d] hover:bg-[#fff3d1]"
                  }`}
                >
                  {value === "ALL MONTHS" ? "All months" : value.slice(0, 3)}
                </Link>
              ))}
            </nav>
          </section>

          <section
            aria-label="Financial highlights"
            className="mt-6 grid gap-5 md:grid-cols-3"
          >
            <Stat label="Total sales" amount={summary.totalSales} gold />
            <Stat label="Total profit" amount={summary.profit} gold />
            <Stat label="Total deductions" amount={summary.deductions} gold />
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">Bank activity</h2>
            <p className="apex-description">
              Net activity attributed to {period.toLowerCase()}.
              Opening balances are not included.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {BANKS.map((bank) => (
                <Stat
                  key={bank}
                  label={bank}
                  amount={data.bankTotals[bank]}
                />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">Sales and expenses</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {operatingCards.map(([label, amount]) => (
                <Stat key={label} label={label} amount={amount} />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">Benefits tracker</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {["SSS", "PAG-IBIG", "PHILHEALTH", "HMO"].map((name) => (
                <Stat
                  key={name}
                  label={`${name} benefits`}
                  amount={data.benefitTotals[name]}
                  gold
                />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">
              Collections and cash advances
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <Stat
                label="Sales less withholding taxes"
                amount={summary.netSales}
                gold
              />
              <Stat
                label="For collection"
                amount={summary.outstanding}
                gold
              />
              <Stat
                label="Cash advance issued"
                amount={summary.advanceIssued}
                gold
              />
              <Stat
                label="For collection · cash advance"
                amount={summary.advanceBalance}
                gold
              />
            </div>
          </section>

          <div className="mt-8">
            <DashboardCharts data={data} year={year} />
          </div>

          <section className="apex-panel mt-8">
            <h2 className="apex-section-title">
              Monthly available funds · {year}
            </h2>
            <p className="apex-description">
              Each month’s profit after withholding, VAT, expenses,
              salaries, commissions, incentives, and benefits.
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="apex-table">
                <thead>
                  <tr>
                    <th scope="col">Tracker</th>
                    {data.monthly.map((entry) => (
                      <th scope="col" key={entry.month}>{entry.month}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Available funds</th>
                    {data.monthly.map((entry) => (
                      <td
                        key={entry.month}
                        className={entry.profit < 0 ? "text-[#b42318]" : ""}
                      >
                        {entry.active ? pesos(entry.profit) : "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">Half-year summary</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <Stat label="Jan–Jun funds" amount={funds(0, 6)} gold />
              <Stat label="Jul–Dec funds" amount={funds(6, 12)} gold />
              <Stat label="Jan–Jun expenses and deductions" amount={deductions(0, 6)} />
              <Stat label="Jul–Dec expenses and deductions" amount={deductions(6, 12)} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="apex-section-title">Half-year total sales</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Stat label="Jan–Jun total sales" amount={halfSales(0, 6)} gold />
              <Stat label="Jul–Dec total sales" amount={halfSales(6, 12)} gold />
            </div>
          </section>

          <section className="apex-panel mt-8">
            <h2 className="apex-section-title">Annual total funds</h2>
            {data.annualReady ? (
              <p className="mt-4 text-4xl font-semibold text-[#082451] tabular-nums">
                {funds(0, 12) === null ? "—" : pesos(funds(0, 12)!)}
              </p>
            ) : (
              <p className="apex-description">
                Available after {data.annualReleaseDate}, matching
                the spreadsheet’s final-weekday release rule.
              </p>
            )}
          </section>

          <details className="apex-panel mt-8">
            <summary className="cursor-pointer text-xl font-semibold">
              Sales details and calculation basis
            </summary>

            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <Stat label="Base sales" amount={summary.baseSales} />
              <Stat label="VAT" amount={summary.vat} />
              <Stat label="Withholding" amount={summary.withholding} />
              <Stat label="Sales payments received · selected period" amount={summary.received} />
            </div>

            <p className="mt-5 leading-8 text-[#52647d]">
              {summary.recordCount} sales records in this period.
              Sales totals use the assigned sale month and year.
              Sales payments received use the actual payment date,
              including receipts for sales from other periods.
              For collection shows the current unpaid balance of
              sales assigned to this period, including all recorded
              payments. Expense and payroll totals use their
              assigned accounting periods. Rankings and charts cover
              the full selected year.
            </p>

            <p className="mt-3 leading-8 text-[#52647d]">
              Benefits reduce the selected bank’s activity. Cash
              advance repayments are credited to BDO. Declined cash
              advances are excluded. Monthly available funds are
              monthly profit without carryover.
            </p>

            <Link
              href="/sales"
              className="mt-4 inline-block font-semibold text-[#082451] underline underline-offset-4"
            >
              View sales records
            </Link>
          </details>

          {canViewDashboard(profile.role) && (
            <div className="mt-8">
              <DailyReportPanel today={today} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}