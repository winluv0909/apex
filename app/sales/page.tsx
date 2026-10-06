import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApexNavigation from "../dashboard/apex-navigation";
import { readRows } from "../dashboard/dashboard-data";
import SalesEntryForm from "./sales-entry-form";

const SALES_OPTIONS = [
  {
    value: "non_vatable",
    label: "NON VATABLE SALES",
  },
  {
    value: "vatable",
    label: "VATABLE SALES",
  },
  {
    value: "vatable_with_withholding",
    label: "VATABLE SALES WITH WITHHOLDING TAX",
  },
];

type PageProps = {
  searchParams: Promise<{
    type?: string;
    status?: string;
    error?: string;
    success?: string;
  }>;
};

function pesos(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

function toCentavos(value: unknown) {
  return Math.round(Number(value ?? 0) * 100);
}

function formatDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "—";
  }

  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

export default async function SalesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) redirect("/login");

  const query = await searchParams;

  const saleType = SALES_OPTIONS.some(
    (option) => option.value === query.type,
  )
    ? String(query.type)
    : "non_vatable";

  const selectedStatus =
    query.status === "paid" || query.status === "paying"
      ? query.status
      : "all";

  const selectedOption = SALES_OPTIONS.find(
    (option) => option.value === saleType,
  )!;

  const [allSales, allPayments, profileResult, banksResult] =
    await Promise.all([
      readRows(supabase, "sales"),
      readRows(supabase, "sale_payments"),
      supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", claims.claims.sub)
        .single(),
      supabase
        .from("banks")
        .select("id, name")
        .order("name"),
    ]);

  if (banksResult.error) {
    throw new Error(
      `Could not load banks: ${banksResult.error.message}`,
    );
  }

  const profile = profileResult.data;
  const banks = banksResult.data ?? [];
  const canEdit = profile?.role;

  const paymentsBySale = new Map<
    string,
    { down: number; full: number; total: number }
  >();

  for (const payment of allPayments) {
    const saleId = String(payment.sale_id);
    const totals = paymentsBySale.get(saleId) ?? {
      down: 0,
      full: 0,
      total: 0,
    };

    const amount = toCentavos(payment.amount);

    totals.total += amount;

    if (payment.payment_type === "down_payment") {
      totals.down += amount;
    }

    if (payment.payment_type === "final_payment") {
      totals.full += amount;
    }

    paymentsBySale.set(saleId, totals);
  }

  const categorySales = allSales
    .filter((sale) => sale.sale_type === saleType)
    .map((sale) => {
      const payments = paymentsBySale.get(String(sale.id)) ?? {
        down: 0,
        full: 0,
        total: 0,
      };

      // Selling price includes VAT.
      const sellingPrice =
        toCentavos(sale.base_amount) +
        toCentavos(sale.vat_amount);

      // Withholding is deducted from the amount collectible.
      const collectible =
        sellingPrice - toCentavos(sale.withholding_amount);

      const remainingBalance = Math.max(
        0,
        collectible - payments.total,
      );

      return {
        sale,
        sellingPrice,
        downPayment: payments.down,
        fullPayment: payments.full,
        remainingBalance,
        paid: remainingBalance === 0,
      };
    });

  const paidCount = categorySales.filter((item) => item.paid).length;
  const payingCount = categorySales.length - paidCount;

  const filteredSales = categorySales
    .filter((item) => {
      if (selectedStatus === "paid") return item.paid;
      if (selectedStatus === "paying") return !item.paid;
      return true;
    })
    .sort((left, right) => {
      const leftDate = String(left.sale.created_at ?? "");
      const rightDate = String(right.sale.created_at ?? "");

      return (
        rightDate.localeCompare(leftDate) ||
        String(right.sale.id).localeCompare(String(left.sale.id))
      );
    });

  const recentSales = filteredSales.slice(0, 50);

  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const today = ["year", "month", "day"]
    .map((part) => todayParts.find((item) => item.type === part)?.value)
    .join("-");

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
          active="sales"
          fullName={profile?.full_name || "APEX team"}
          role={profile?.role || ""}
        />

        <div className="apex-content">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.3em] text-[#8a6309]">
                APEX
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-[#082451]">
                Sales
              </h1>
              <p className="apex-section-description mt-2">
                Record sales by month, customer, agent, and tax type.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {["owner", "admin", "staff"].includes(canEdit ?? "") && (
                <Link
                  href="#add-entry"
                  className="rounded-xl bg-[#f2b72f] px-5 py-3 font-bold text-[#082451] transition hover:bg-[#e9ad25]"
                >
                  + Add sale
                </Link>
              )}

              <Link
                href="/dashboard"
                className="rounded-xl border border-[#dce4ef] bg-white px-5 py-3 font-semibold text-[#082451] transition hover:bg-[#edf2f9]"
              >
                ← Dashboard
              </Link>
            </div>
          </header>

          <nav
            aria-label="Sales category"
            className="mb-8 grid gap-3 lg:grid-cols-3"
          >
            {SALES_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={`/sales?type=${option.value}&status=${selectedStatus}`}
                aria-current={
                  saleType === option.value ? "page" : undefined
                }
                className={
                  saleType === option.value
                    ? "flex min-h-16 items-center rounded-xl border border-[#082451] bg-[#082451] px-5 py-4 font-semibold text-white shadow-sm"
                    : "flex min-h-16 items-center rounded-xl border border-[#dce4ef] bg-white px-5 py-4 font-semibold text-[#082451] transition hover:border-[#f2b72f] hover:bg-[#fff8e8]"
                }
              >
                {option.label}
              </Link>
            ))}
          </nav>

          <h2 className="mb-6 text-2xl font-semibold text-[#082451]">
            {selectedOption.label}
          </h2>

          {query.success && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
            >
              Sale saved successfully.
            </p>
          )}

          {query.error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
            >
              {query.error === "invalid"
                ? "Check the required fields and amounts."
                : "The sale could not be saved. Check your account permissions and try again."}
            </p>
          )}

          {(canEdit === "owner" ||
            canEdit === "admin" ||
            canEdit === "staff") && (
            <SalesEntryForm
              key={saleType}
              saleType={saleType}
              banks={banks.map((bank) => ({
                id: String(bank.id),
                name: bank.name,
              }))}
              today={today}
            />
          )}

          <section className="apex-panel">
            <div className="mb-5 border-b border-[#dce4ef] pb-5">
              <h2 className="apex-section-title">Recent sales</h2>

              <p className="apex-section-description mt-1">
                Showing {recentSales.length} of {filteredSales.length} matching
                sales for {selectedOption.label}.
              </p>

              <nav
                aria-label="Payment status"
                className="mt-5 flex flex-wrap gap-3"
              >
                {[
                  {
                    value: "all",
                    label: "All customers",
                    count: categorySales.length,
                  },
                  {
                    value: "paid",
                    label: "PAID customers",
                    count: paidCount,
                  },
                  {
                    value: "paying",
                    label: "Still paying",
                    count: payingCount,
                  },
                ].map((filter) => (
                  <Link
                    key={filter.value}
                    href={`/sales?type=${saleType}&status=${filter.value}`}
                    aria-current={
                      selectedStatus === filter.value ? "page" : undefined
                    }
                    className={
                      selectedStatus === filter.value
                        ? "rounded-xl bg-[#082451] px-5 py-3 font-semibold text-white"
                        : "rounded-xl border border-[#dce4ef] bg-white px-5 py-3 font-semibold text-[#082451] transition hover:bg-[#edf2f9]"
                    }
                  >
                    {filter.label} ({filter.count})
                  </Link>
                ))}
              </nav>
            </div>

            <div className="overflow-x-auto">
              <table className="apex-table min-w-250 text-left">
                <caption className="sr-only">
                  {selectedOption.label} filtered by payment status
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Period (MM/DD/YYYY)</th>
                    <th scope="col">Customer Name</th>
                    <th scope="col">Company name</th>
                    <th scope="col">Agent</th>
                    <th scope="col" className="text-right">Selling Price</th>
                    <th scope="col" className="text-right">Down payment</th>
                    <th scope="col" className="text-right">Full payment</th>
                    <th scope="col" className="text-right">
                      Remaining Balance
                    </th>
                    <th scope="col">Remarks</th>
                  </tr>
                </thead>

                <tbody>
                  {recentSales.map((item) => (
                    <tr
                      key={String(item.sale.id)}
                      className="border-t border-[#dce4ef]"
                    >
                      <td className="whitespace-nowrap">
                        {formatDate(item.sale.sale_date)}
                      </td>

                      <td>
                        <Link
                          href={`/sales/${item.sale.id}`}
                          className="font-semibold text-[#082451] underline decoration-[#f2b72f] underline-offset-4 hover:text-[#8a6309]"
                        >
                          {String(item.sale.customer_name ?? "")}
                        </Link>
                      </td>

                      <td>{String(item.sale.company_name || "—")}</td>
                      <td>{String(item.sale.agent_name ?? "")}</td>

                      <td className="text-right whitespace-nowrap">
                        {pesos(item.sellingPrice)}
                      </td>

                      <td className="text-right whitespace-nowrap">
                        {pesos(item.downPayment)}
                      </td>

                      <td className="text-right whitespace-nowrap">
                        {pesos(item.fullPayment)}
                      </td>

                      <td className="text-right font-semibold whitespace-nowrap">
                        {pesos(item.remainingBalance)}
                      </td>

                      <td>
                        <span
                          className={
                            item.paid
                              ? "inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-base font-semibold text-emerald-800"
                              : "inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-base font-semibold text-amber-800"
                          }
                        >
                          {item.paid ? "PAID" : "STILL PAYING"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {recentSales.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-8 text-center text-[#52647d]"
                      >
                        No sales match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-base text-[#52647d]">
              Click the customer name to view or record payments.
              Selling Price includes VAT. Remaining Balance deducts
              withholding tax and all recorded payments.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}