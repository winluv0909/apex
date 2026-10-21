import { canManageData, canViewDashboard } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import EntryForms from "../entry-forms";

import { createClient } from "@/lib/supabase/server";
import ApexNavigation from "../../apex-navigation";
import {
  MONTHS,
  manilaToday,
  readRows,
  type Row,
} from "../../dashboard-data";

type Config = {
  title: string;
  table: string;
  year: string;
  month: string;
  columns: [string, string][];
  money: string[];
};

const REPAYMENT_COLUMNS: [string, string][] = Array.from(
  { length: 20 },
  (_, index): [string, string][] => {
    const number = index + 1;

    return [
      [`repaid_amount_${number}`, `REPAID AMOUNT ${number}`],
      [`repayment_date_${number}`, `PAYMENT DATE ${number}`],
    ];
  },
).flat();

const CONFIG: Record<string, Config> = {
  benefits: {
    title: "Benefits",
    table: "benefits",
    year: "benefit_year",
    month: "benefit_month",
    columns: [
      ["benefit_month", "MONTH"],
      ["benefit_year", "YEAR"],
      ["employee_name", "EMPLOYEE NAME"],
      ["total_contribution", "TOTAL CONTRIBUTION"],
      ["employee_contribution", "EMPLOYEE CONTRIBUTION"],
      ["employer_contribution", "EMPLOYER CONTRIBUTION"],
      ["payment_date", "DATE"],
      ["payment_method", "MODE OF PAYMENT"],
      ["bank_id", "BANK NAME"],
    ],
    money: [
      "employee_contribution",
      "employer_contribution",
      "total_contribution",
    ],
  },
  salaries: {
    title: "Salaries",
    table: "salaries",
    year: "salary_year",
    month: "salary_month",
    columns: [
      ["salary_year", "YEAR"],
      ["salary_month", "MONTH"],
      ["cut_off_period", "CUT OFF PERIOD"],
      ["payout_type", "PAYOUT TYPE"],
      ["employee_name", "EMPLOYEE NAME"],
      ["position", "POSITION"],
      ["basic_salary", "BASIC SALARY"],
      ["total_allowance", "TOTAL ALLOWANCE"],
      ["gross_salary", "GROSS SALARY"],
      ["sss_deduction", "SSS(DEDUCTION)"],
      ["pagibig_deduction", "PAGIBIG(DEDUCTION)"],
      ["philhealth_deduction", "PHILHEALTH(DEDUCTION)"],
      ["hmo_deduction", "HMO(DEDUCTION)"],
      ["amount", "NET SALARY"],
      ["payment_date", "PAYMENT DATE"],
      ["payment_method", "MODE OF PAYMENT"],
      ["bank_id", "BANK NAME"],
      ["status", "STATUS"],
      ["description", "Description"],
    ],
    money: [
      "basic_salary",
      "total_allowance",
      "gross_salary",
      "sss_deduction",
      "pagibig_deduction",
      "philhealth_deduction",
      "hmo_deduction",
      "amount",
    ],
  },
  incentives: {
    title: "Incentives",
    table: "incentives",
    year: "incentive_year",
    month: "incentive_month",
    columns: [
      ["incentive_month", "MONTH"],
      ["incentive_year", "YEAR"],
      ["recipient_name", "EMPLOYEE / AGENT"],
      ["incentive_type", "INCENTIVE TYPE"],
      ["reference", "REFERENCE"],
      ["amount", "AMOUNT"],
      ["payment_method", "MODE OF PAYMENT"],
      ["bank_id", "BANK NAME"],
      ["payment_date", "PAYMENT DATE"],
      ["notes", "NOTES"],
    ],
    money: ["amount"],
  },
  "cash-advance": {
    title: "Cash Advance",
    table: "cash_advance_balances",
    year: "advance_year",
    month: "advance_month",
    columns: [
      ["advance_month", "MONTH"],
      ["advance_year", "YEAR"],
      ["recipient_name", "EMPLOYEE / AGENT"],
      ["purpose", "PURPOSE"],
      ["issue_date", "ADVANCE DATE"],
      ["amount", "AMOUNT"],
      ...REPAYMENT_COLUMNS,
      ["remaining_balance", "BALANCE"],
      ["payment_method", "MODE OF PAYMENT"],
      ["disbursement_bank_id", "DISBURSEMENT BANK"],
      ["status", "STATUS"],
      ["total_repaid", "Total repaid"],
    ],
    money: [
      "amount",
      "total_repaid",
      "remaining_balance",
      ...Array.from(
        { length: 20 },
        (_, index) => `repaid_amount_${index + 1}`,
      ),
    ],
  },
};

type Props = {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function RecordsPage({
  params,
  searchParams,
}: Props) {
  const { tab } = await params;

  if (!Object.prototype.hasOwnProperty.call(CONFIG, tab)) {
    notFound();
  }

  const config = CONFIG[tab];
  const client = await createClient();
  const { data: auth } = await client.auth.getClaims();

  if (!auth?.claims?.sub) redirect("/login");

  const { data: profile, error } = await client
    .from("profiles")
    .select("full_name, role")
    .eq("id", auth.claims.sub)
    .single();

  if (error || !profile || !canViewDashboard(profile.role)) redirect("/login");

  const query = await searchParams;
  const currentYear = Number(manilaToday().slice(0, 4));
  const requestedYear = Number(query.year);

  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2026 &&
    requestedYear <= 2100
      ? requestedYear
      : currentYear;

  const requestedMonth = Number(query.month);

  const month =
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 0 &&
    requestedMonth <= 12
      ? requestedMonth
      : 0;

  const [allRows, banks] = await Promise.all([
    readRows(client, config.table, config.year, year),
    readRows(client, "banks"),
  ]);

  const rows: Row[] = allRows
    .filter(
      (row) => month === 0 || Number(row[config.month]) === month,
    )
    .map((row) => ({ ...row }));

  const bankNames = new Map(
    banks.map((bank) => [String(bank.id), String(bank.name)]),
  );

  const canEdit = canManageData(profile.role);

  const outstandingAdvances =
    tab === "cash-advance"
      ? await readRows(client, "cash_advance_balances")
      : [];

  const formBanks = banks.map((bank) => ({
    id: String(bank.id),
    name: String(bank.name),
  }));

  const formAdvances = outstandingAdvances
    .filter(
      (advance) =>
        !advance.is_declined &&
        Number(advance.remaining_balance) > 0,
    )
    .map((advance) => ({
      id: String(advance.id),
      name: String(advance.recipient_name ?? "Cash advance"),
      balance: Number(advance.remaining_balance),
    }));

  if (tab === "salaries") {
    for (const row of rows) {
      const hasPayroll =
        row.basic_salary !== null &&
        row.basic_salary !== undefined &&
        row.total_allowance !== null &&
        row.total_allowance !== undefined;

      row.gross_salary = hasPayroll
        ? (
            Math.round(Number(row.basic_salary) * 100) +
            Math.round(Number(row.total_allowance) * 100)
          ) / 100
        : null;
    }
  }

  if (tab === "cash-advance") {
    // Purpose belongs to cash_advances. The balance view may not
    // expose columns added after the view was created.
    const [advanceDetails, repayments] = await Promise.all([
      readRows(client, "cash_advances", "advance_year", year),
      readRows(client, "cash_advance_repayments"),
    ]);

    const detailsById = new Map(
      advanceDetails.map((advance) => [
        String(advance.id),
        advance,
      ]),
    );

    const rowsById = new Map(
      rows.map((row) => [String(row.id), row]),
    );

    for (const row of rows) {
      const details = detailsById.get(String(row.id));
      row.purpose = details?.purpose ?? row.purpose ?? null;
    }

    for (const repayment of repayments) {
      const row = rowsById.get(String(repayment.cash_advance_id));
      const number = Number(repayment.repayment_number);

      if (
        !row ||
        !Number.isInteger(number) ||
        number < 1 ||
        number > 20
      ) {
        continue;
      }

      row[`repaid_amount_${number}`] = repayment.amount;
      row[`repayment_date_${number}`] = repayment.payment_date;
    }
  }

  function display(row: Row, field: string) {
    const value = row[field];

    if (value === null || value === undefined || value === "") {
      return "—";
    }

    if (field === config.month) {
      return MONTHS[Number(value) - 1] ?? String(value);
    }

    if (config.money.includes(field)) {
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(Number(value));
    }

    if (field === "bank_id" || field === "disbursement_bank_id") {
      return bankNames.get(String(value)) ?? "Unknown bank";
    }

    return String(value).replaceAll("_", " ");
  }

  function renderTable(tableRows: Row[], caption: string) {
    return (
      <div className="mt-5 overflow-x-auto">
        <table className="apex-table">
          <caption className="sr-only">{caption}</caption>

          <thead>
            <tr>
              {config.columns.map(([field, label]) => (
                <th key={field} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {tableRows.map((row) => (
              <tr key={String(row.id)}>
                {config.columns.map(([field]) => (
                  <td key={field}>{display(row, field)}</td>
                ))}
              </tr>
            ))}

            {!tableRows.length && (
              <tr>
                <td colSpan={config.columns.length}>
                  No records for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const benefitTypes = ["SSS", "PAG-IBIG", "PHILHEALTH", "HMO"];

  const otherBenefitRows = rows.filter(
    (row) => !benefitTypes.includes(String(row.benefit_type)),
  );

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
          sizes="100vw"
          className="object-cover object-[70%_center]"
        />
        <div className="absolute inset-0 bg-[#f5f7fb]/90" />
      </div>

      <div className="apex-workspace">
        <ApexNavigation
          active={tab}
          fullName={profile.full_name || "APEX team"}
          role={profile.role}
        />

        <div className="apex-content">
          <h1 className="mb-6 text-4xl font-semibold text-[#082451]">
            {config.title}
          </h1>

          <section className="apex-panel">
            <form
              key={`${year}-${month}`}
              method="get"
              action={`/dashboard/records/${tab}`}
              className="flex flex-wrap items-end gap-4"
            >
              <label className="font-semibold">
                Year
                <select
                  name="year"
                  defaultValue={year}
                  className="apex-control mt-2"
                >
                  {Array.from(
                    { length: 2100 - 2026 + 1 },
                    (_, index) => 2026 + index,
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="font-semibold">
                Month
                <select
                  name="month"
                  defaultValue={month}
                  className="apex-control mt-2"
                >
                  <option value={0}>All months</option>
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#f2b72f] px-6 py-3 font-bold text-[#082451]"
              >
                Apply
              </button>
            </form>
          </section>

          {canEdit && (
            <EntryForms
              key={`${tab}-${year}-${month}`}
              tab={tab}
              title={config.title}
              banks={formBanks}
              advances={formAdvances}
              year={year}
              month={month}
              today={manilaToday()}
            />
          )}

          <section className="apex-panel mt-6">
            <h2 className="apex-section-title">
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </h2>

            {tab === "benefits" ? (
              <div className="mt-6 space-y-8">
                {benefitTypes.map((type) => {
                  const benefitRows = rows.filter(
                    (row) => row.benefit_type === type,
                  );

                  return (
                    <section key={type}>
                      <h3 className="text-2xl font-semibold text-[#082451]">
                        {type}
                      </h3>

                      {renderTable(
                        benefitRows,
                        `${type} records for the selected period`,
                      )}
                    </section>
                  );
                })}

                {otherBenefitRows.length > 0 && (
                  <section>
                    <h3 className="text-2xl font-semibold text-[#082451]">
                      Other benefit records
                    </h3>

                    {renderTable(
                      otherBenefitRows,
                      "Other benefit records for the selected period",
                    )}
                  </section>
                )}
              </div>
            ) : (
              renderTable(
                rows,
                `${config.title} records for the selected period`,
              )
            )}
          </section>
        </div>
      </div>
    </main>
  );
}