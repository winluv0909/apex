import { canManageData, canViewDashboard } from "@/lib/permissions";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApexNavigation from "../dashboard/apex-navigation";
import { addExpense } from "./actions";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const CATEGORIES = {
  operational: [
    "CONSUMABLES",
    "OFFICE CONSUMABLES",
    "PRODUCTION MATERIALS",
    "POWDERCOATING FEE’S",
    "TRANSPO FEE’S",
  ],
  capital: [
    "RENT",
    "TAXES",
    "OFFICE RENOVATION",
    "WATER BILLS",
    "ELECTRIC BILLS",
    "INTERNET BILLS",
    "CASH LOAN",
    "MACHINE LOAN",
    "CAR LOAN",
    "BUSINESS PERMITS",
  ],
};

const inputClass = "apex-control mt-2 block w-full";

const buttonClass =
  "rounded-xl border border-[#dce4ef] bg-white px-5 py-3 font-semibold text-[#082451] transition hover:bg-[#edf2f9]";

type PageProps = {
  searchParams: Promise<{
    type?: string;
    error?: string;
    success?: string;
  }>;
};

function pesos(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const expenseType =
    query.type === "capital" ? "capital" : "operational";

  const title =
    expenseType === "capital"
      ? "Capital Expenses"
      : "Operational Expenses";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();

  if (!auth?.claims?.sub) redirect("/login");

  const [profileResult, banksResult, expensesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", auth.claims.sub)
      .single(),
    supabase
      .from("banks")
      .select("id, name")
      .order("name"),
    supabase
      .from("expenses")
      .select(
        "id, expense_month, expense_year, category, description, expense_date, amount, payment_method, bank_id, receiver, supplier_name, company_name, tin_no, company_address, receipt_no, tax_classification"
      )
      .eq("expense_type", expenseType)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
  ]);

  if (profileResult.error || !profileResult.data || !canViewDashboard(profileResult.data.role)) {
    redirect("/login");
  }

  if (banksResult.error || expensesResult.error) {
    throw new Error(
      `Could not load expenses: ${
        banksResult.error?.message ?? expensesResult.error?.message
      }`
    );
  }

  const banks = banksResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const canEdit = canManageData(profileResult.data.role);

  const now = new Date();
  const manilaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const currentYear = Number(
    manilaDate.find((part) => part.type === "year")?.value
  );
  const currentMonth = Number(
    manilaDate.find((part) => part.type === "month")?.value
  );

  const years = Array.from(
    { length: 2100 - 2026 + 1 },
    (_, index) => 2026 + index
  );

  const errorMessages: Record<string, string> = {
    permission: "Your account cannot add expenses.",
    invalid: "Check the required fields, amount, date, and bank selection.",
    bank: "Select a valid bank for the bank transfer.",
    save: "The expense could not be saved. Check the VS Code terminal for the exact error.",
  };

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
          active={expenseType}
          fullName={profileResult.data.full_name || "APEX team"}
          role={profileResult.data.role}
        />

        <div className="apex-content">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.3em] text-[#8a6309]">
                APEX
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-[#082451]">
                {title}
              </h1>
              <p className="apex-section-description mt-2">
                Record expenses by period, category, and payment method.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {canEdit && (
                <Link
                  href="#add-entry"
                  className="rounded-xl bg-[#f2b72f] px-5 py-3 font-bold text-[#082451] transition hover:bg-[#e9ad25]"
                >
                  + Add expense
                </Link>
              )}

              <Link href="/dashboard" className={buttonClass}>
                ← Dashboard
              </Link>
            </div>
          </header>

          <nav
            className="mb-7 flex flex-wrap gap-3"
            aria-label="Expense type"
          >
            {[
              { type: "operational", label: "Operational Expenses" },
              { type: "capital", label: "Capital Expenses" },
            ].map((tab) => (
              <Link
                key={tab.type}
                href={`/expenses?type=${tab.type}`}
                aria-current={expenseType === tab.type ? "page" : undefined}
                className={
                  expenseType === tab.type
                    ? "rounded-xl bg-[#f2b72f] px-5 py-3 font-bold text-[#082451]"
                    : buttonClass
                }
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {query.success === "1" && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
            >
              Expense saved successfully.
            </p>
          )}

          {query.error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
            >
              {errorMessages[query.error] ?? "Could not complete the request."}
            </p>
          )}

          {canEdit && (
            <section
              id="add-entry"
              className="apex-panel mb-8"
              style={{
                scrollMarginTop:
                  "calc(var(--apex-header-height, 112px) + 20px)",
              }}
            >
              <h2 className="apex-section-title mb-6">Add an expense</h2>

              <form
                key={expenseType}
                action={addExpense}
                className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
              >
                <input
                  type="hidden"
                  name="expense_type"
                  value={expenseType}
                />

                <label className="font-semibold">
                  CATEGORY
                  <select
                    name="category"
                    required
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="" disabled>Select category</option>
                    {CATEGORIES[expenseType].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="font-semibold">
                  PARTICULAR
                  <input
                    name="description"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                    placeholder="What was this expense for?"
                  />
                </label>

                <label className="font-semibold">
                  AMOUNT
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  RECEIVER
                  <input
                    name="receiver"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  SUPPLIER NAME
                  <input
                    name="supplier_name"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  COMPANY NAME
                  <input
                    name="company_name"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  TIN NO.
                  <input
                    name="tin_no"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  COMPANY ADDRESS
                  <input
                    name="company_address"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  MODE OF PAYMENT
                  <select
                    name="payment_method"
                    required
                    defaultValue="CASH"
                    className={inputClass}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK TRANSFER">Bank Transfer</option>
                  </select>
                </label>

                <label className="font-semibold">
                  BANK NAME
                  <select
                    name="bank_id"
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="">Select bank for bank transfer</option>
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="font-semibold">
                  DATE
                  <input
                    name="expense_date"
                    type="date"
                    required
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  RECEIPT NO.
                  <input
                    name="receipt_no"
                    type="text"
                    maxLength={500}
                    className={inputClass}
                  />
                </label>

                <label className="font-semibold">
                  VATALE OR NON VATABLE PRICE
                  <select
                    name="tax_classification"
                    required
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="" disabled>Select classification</option>
                    <option value="VATABLE">VATABLE</option>
                    <option value="NON-VATABLE">NON-VATABLE</option>
                  </select>
                </label>

                <label className="font-semibold">
                  MONTH
                  <select
                    name="expense_month"
                    required
                    defaultValue={currentMonth}
                    className={inputClass}
                  >
                    {MONTHS.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="font-semibold">
                  YEAR
                  <select
                    name="expense_year"
                    required
                    defaultValue={currentYear}
                    className={inputClass}
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="text-base text-[#52647d] md:col-span-2">
                  For Bank Transfer, select the bank that paid the expense.
                  For Cash, the record is saved without a bank.
                </p>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#f2b72f] p-3 font-bold text-[#082451] transition hover:bg-[#e9ad25]"
                  >
                    Save expense
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="apex-panel">
            <div className="mb-5 border-b border-[#dce4ef] pb-5">
              <h2 className="apex-section-title">Recent expenses</h2>
              <p className="apex-section-description mt-1">
                Showing the latest 50 {expenseType} records across all periods.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="apex-table min-w-250 text-left">
                <thead>
                  <tr>
                    {[
                      "CATEGORY",
                      "PARTICULAR",
                      "AMOUNT",
                      "RECEIVER",
                      "SUPPLIER NAME",
                      "COMPANY NAME",
                      "TIN NO.",
                      "COMPANY ADDRESS",
                      "MODE OF PAYMENT",
                      "BANK NAME",
                      "DATE",
                      "RECEIPT NO.",
                      "VATALE OR NON VATABLE PRICE",
                      "MONTH",
                      "YEAR",
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className={`p-4 ${
                          heading === "AMOUNT" ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-t border-[#dce4ef]"
                    >
                      <td className="p-4">{expense.category}</td>
                      <td className="p-4">{expense.description || "—"}</td>
                      <td className="p-4 text-right font-semibold whitespace-nowrap text-[#082451]">
                        {pesos(Number(expense.amount))}
                      </td>
                      <td className="p-4">{expense.receiver || "—"}</td>
                      <td className="p-4">{expense.supplier_name || "—"}</td>
                      <td className="p-4">{expense.company_name || "—"}</td>
                      <td className="p-4">{expense.tin_no || "—"}</td>
                      <td className="p-4">{expense.company_address || "—"}</td>
                      <td className="p-4 whitespace-nowrap">
                        {expense.payment_method === "CASH"
                          ? "Cash"
                          : "Bank Transfer"}
                      </td>
                      <td className="p-4">
                        {expense.payment_method === "CASH"
                          ? "—"
                          : banks.find(
                              (bank) =>
                                String(bank.id) === String(expense.bank_id)
                            )?.name ?? "Unknown bank"}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {expense.expense_date || "—"}
                      </td>
                      <td className="p-4">{expense.receipt_no || "—"}</td>
                      <td className="p-4">
                        {expense.tax_classification || "—"}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {MONTHS[Number(expense.expense_month) - 1]}
                      </td>
                      <td className="p-4">{expense.expense_year}</td>
                    </tr>
                  ))}

                  {expenses.length === 0 && (
                    <tr>
                      <td
                        colSpan={15}
                        className="p-8 text-center text-[#52647d]"
                      >
                        No {expenseType} expenses recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}