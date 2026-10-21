import { canManageData, canViewDashboard } from "@/lib/permissions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPayment } from "./actions";
import Image from "next/image";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

function pesos(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export default async function SaleDetailsPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const [saleResult, paymentsResult, banksResult, profileResult] =
    await Promise.all([
      supabase.from("sales").select("*").eq("id", id).single(),
      supabase
        .from("sale_payments")
        .select("id, payment_type, amount, payment_date, payment_method, bank_id")
        .eq("sale_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("banks").select("id, name").order("name"),
      supabase
        .from("profiles")
        .select("role")
        .eq("id", claims.claims.sub)
        .single(),
    ]);

  if (profileResult.error || !canViewDashboard(profileResult.data?.role)) redirect("/login");

  if (!saleResult.data) notFound();

  if (paymentsResult.error || banksResult.error) {
    throw new Error("Could not load payment information.");
  }

  const sale = saleResult.data;
  const payments = paymentsResult.data ?? [];
  const banks = banksResult.data ?? [];
  const role = profileResult.data?.role;
  const canEdit = canManageData(role);

  const toCentavos = (value: unknown) =>
    Math.round(Number(value ?? 0) * 100);

  const totalCentavos =
    toCentavos(sale.base_amount) +
    toCentavos(sale.vat_amount) -
    toCentavos(sale.withholding_amount);

  const paidCentavos = payments.reduce(
    (sum, payment) => sum + toCentavos(payment.amount),
    0
  );

  const balanceCentavos = Math.max(0, totalCentavos - paidCentavos);

  const total = totalCentavos / 100;
  const paid = paidCentavos / 100;
  const balance = balanceCentavos / 100;

  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const today = ["year", "month", "day"]
    .map((type) => todayParts.find((part) => part.type === type)?.value)
    .join("-");

  const errorMessages: Record<string, string> = {
    invalid: "Check the payment fields and try again.",
    load: "Could not verify the sale balance.",
    exceeds: "Payment exceeds the remaining balance.",
    save: "Could not save the payment. Check your permissions and try again.",
    permissions: "You do not have permission to record payments.",
    bank: "Select a valid receiving bank for a bank transfer.",
  };

  return (
    <main
      className="relative isolate min-h-screen px-5 py-8 text-white md:px-10"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/images/apex-solar-details-background.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />

        <div className="absolute inset-0 bg-[#090f1d]/85" />
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-[#c9a96a]">
              APEX
            </p>

            <h1 className="mt-2 text-3xl font-semibold">
              {sale.customer_name}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {sale.agent_name} · {sale.sale_month}/{sale.sale_year}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canEdit && balanceCentavos > 0 && (
              <Link
                href="#add-entry"
                className="rounded-lg bg-[#c9a96a] px-5 py-3 text-base font-bold text-[#101827]"
              >
                + Record payment
              </Link>
            )}

            <Link
              href="/sales"
              className="rounded-lg border border-white/15 px-5 py-3 text-base"
            >
              ← Sales
            </Link>
          </div>
        </div>

        {query.success && (
          <p
            role="status"
            className="mb-5 rounded-lg bg-emerald-500/10 p-4 text-emerald-200"
          >
            Payment saved successfully.
          </p>
        )}

        {query.error && (
          <p
            role="alert"
            className="mb-5 rounded-lg bg-red-500/10 p-4 text-red-200"
          >
            {errorMessages[query.error] ?? "Something went wrong."}
          </p>
        )}

        <section className="mb-7 grid gap-4 sm:grid-cols-3">
          {[
            ["Sale total after withholding", total],
            ["Paid", paid],
            ["Remaining balance", balance],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-[#121e33] p-6"
            >
              <p className="text-sm text-slate-400">{label}</p>

              <p className="mt-4 text-2xl font-semibold text-[#f1d6a3]">
                {pesos(Number(value))}
              </p>
            </div>
          ))}
        </section>

        {canEdit && balanceCentavos > 0 && (
          <section
            id="add-entry"
            className="mb-7 rounded-2xl border border-white/10 bg-[#121e33] p-6"
            style={{
              scrollMarginTop:
                "calc(var(--apex-header-height, 112px) + 20px)",
            }}
          >
            <h2 className="mb-5 text-xl font-semibold">Record payment</h2>

            <form action={addPayment} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="sale_id" value={id} />

              <label className="text-sm text-slate-300">
                Payment type
                <select
                  name="payment_type"
                  required
                  className="mt-2 w-full rounded-lg bg-[#1b2a44] p-3"
                >
                  <option value="down_payment">Down payment</option>
                  <option value="final_payment">Final payment</option>
                </select>
              </label>

              <label className="text-sm text-slate-300">
                Amount (₱)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={balance}
                  step="0.01"
                  required
                  className="mt-2 w-full rounded-lg bg-[#1b2a44] p-3"
                />
              </label>

              <label className="text-sm text-slate-300">
                Payment date
                <input
                  name="payment_date"
                  type="date"
                  defaultValue={today}
                  max={today}
                  required
                  className="mt-2 w-full rounded-lg bg-[#1b2a44] p-3"
                />
              </label>

              <label className="text-sm text-slate-300">
                Mode of payment
                <select
                  name="payment_method"
                  defaultValue="CASH"
                  required
                  className="mt-2 w-full rounded-lg bg-[#1b2a44] p-3"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK TRANSFER">Bank Transfer</option>
                </select>
              </label>

              <label className="text-sm text-slate-300">
                Bank for bank transfers
                <select
                  name="bank_id"
                  className="mt-2 w-full rounded-lg bg-[#1b2a44] p-3"
                >
                  <option value="">Select bank</option>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#c9a96a] p-3 font-bold text-[#101827]"
                >
                  Save payment
                </button>
              </div>
            </form>

            <p className="mt-4 text-xs text-slate-400">
              For Cash, leave the bank selection blank. For Bank Transfer,
              choose the receiving bank.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-[#121e33] p-6">
          <h2 className="mb-4 text-xl font-semibold">Payment history</h2>

          {payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap justify-between gap-3 border-t border-white/10 py-3 text-sm"
                >
                  <span>
                    {payment.payment_type === "down_payment"
                      ? "Down payment"
                      : "Final payment"}{" "}
                    · {payment.payment_date ?? "No date"}
                    {" · "}
                    {payment.payment_method === "CASH"
                      ? "Cash"
                      : banks.find(
                          (bank) =>
                            String(bank.id) === String(payment.bank_id)
                        )?.name ?? "Bank Transfer"}
                  </span>

                  <strong className="text-[#f1d6a3]">
                    {pesos(Number(payment.amount))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}