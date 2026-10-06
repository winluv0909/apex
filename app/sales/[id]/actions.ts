"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const SALE_TYPES = [
  "non_vatable",
  "vatable",
  "vatable_with_withholding",
];

export async function addSale(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "owner"
  ) {
    redirect("/sales?error=permission");
  }

  const sale_month = Number(formData.get("sale_month"));
  const sale_year = Number(formData.get("sale_year"));
  const sale_type = String(formData.get("sale_type") ?? "");
  const agent_name = String(formData.get("agent_name") ?? "").trim();
  const customer_name = String(formData.get("customer_name") ?? "").trim();

  const amountFields = [
    "base_amount",
    "vat_amount",
    "withholding_amount",
  ] as const;

  const amountTexts = amountFields.map((field) =>
    String(formData.get(field) ?? "").trim(),
  );

  const [base_amount, vat_amount, withholding_amount] =
    amountTexts.map(Number);

  const amounts = [base_amount, vat_amount, withholding_amount];

  if (
    !Number.isInteger(sale_month) ||
    sale_month < 1 ||
    sale_month > MONTHS.length ||
    !Number.isInteger(sale_year) ||
    sale_year < 2026 ||
    sale_year > 9999 ||
    !SALE_TYPES.includes(sale_type) ||
    !agent_name ||
    !customer_name ||
    amountTexts.some((value) => !/^\d+(\.\d{1,2})?$/.test(value)) ||
    amounts.some(
      (amount) =>
        !Number.isFinite(amount) ||
        amount < 0 ||
        !Number.isSafeInteger(Math.round(amount * 100)),
    )
  ) {
    redirect("/sales?error=invalid");
  }

  const baseCentavos = Math.round(base_amount * 100);
  const vatCentavos = Math.round(vat_amount * 100);
  const withholdingCentavos = Math.round(withholding_amount * 100);

  if (
    (sale_type === "non_vatable" &&
      (vatCentavos !== 0 || withholdingCentavos !== 0)) ||
    (sale_type === "vatable" && withholdingCentavos !== 0) ||
    withholdingCentavos > baseCentavos + vatCentavos
  ) {
    redirect("/sales?error=invalid");
  }

  const { error } = await supabase.from("sales").insert({
    sale_month,
    sale_year,
    sale_type,
    agent_name,
    customer_name,
    base_amount,
    vat_amount,
    withholding_amount,
  });

  if (error) {
    console.error("Sale insert failed:", error.message);
    redirect("/sales?error=save");
  }

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  redirect("/sales?success=1");
}

export async function addPayment(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) redirect("/login");

  const sale_id = String(formData.get("sale_id") ?? "").trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sale_id,
    )
  ) {
    redirect("/sales?error=invalid");
  }

  const returnTo = `/sales/${sale_id}`;

  function fail(code: string): never {
    redirect(`${returnTo}?error=${code}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "owner"
  ) {
    fail("permission");
  }

  const payment_type = String(
    formData.get("payment_type") ?? "",
  ).trim();

  const amountText = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountText);
  const amountCentavos = Math.round(amount * 100);

  const payment_date = String(
    formData.get("payment_date") ?? "",
  ).trim();

  const payment_method = String(
    formData.get("payment_method") ?? "",
  ).trim();

  const bankText = String(formData.get("bank_id") ?? "").trim();

  if (
    !["down_payment", "final_payment"].includes(payment_type) ||
    !/^\d+(\.\d{1,2})?$/.test(amountText) ||
    !Number.isFinite(amount) ||
    amountCentavos <= 0 ||
    !Number.isSafeInteger(amountCentavos) ||
    amount > 999999999999.99 ||
    !["CASH", "BANK TRANSFER"].includes(payment_method) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)
  ) {
    fail("invalid");
  }

  const parsedDate = new Date(`${payment_date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== payment_date
  ) {
    fail("invalid");
  }

  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const today = ["year", "month", "day"]
    .map((type) => todayParts.find((part) => part.type === type)?.value)
    .join("-");

  if (payment_date < "2026-01-01" || payment_date > today) {
    fail("invalid");
  }

  let bank_id: number | null = null;

  if (payment_method === "BANK TRANSFER") {
    const requestedBankId = Number(bankText);

    if (
      !/^\d+$/.test(bankText) ||
      !Number.isSafeInteger(requestedBankId) ||
      requestedBankId <= 0
    ) {
      fail("bank");
    }

    const { data: bank, error: bankError } = await supabase
      .from("banks")
      .select("id")
      .eq("id", requestedBankId)
      .single();

    if (bankError || !bank) {
      fail("bank");
    }

    bank_id = requestedBankId;
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, base_amount, vat_amount, withholding_amount")
    .eq("id", sale_id)
    .single();

  if (saleError || !sale) {
    fail("load");
  }

  const toCentavos = (value: unknown) =>
    Math.round(Number(value ?? 0) * 100);

  const totalCentavos =
    toCentavos(sale.base_amount) +
    toCentavos(sale.vat_amount) -
    toCentavos(sale.withholding_amount);

  if (
    !Number.isSafeInteger(totalCentavos) ||
    totalCentavos < 0
  ) {
    fail("load");
  }

  let paidCentavos = 0;
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data: payments, error: paymentsError } = await supabase
      .from("sale_payments")
      .select("id, amount")
      .eq("sale_id", sale_id)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (paymentsError) {
      fail("load");
    }

    const paymentRows = payments ?? [];

    for (const payment of paymentRows) {
      const paymentCentavos = toCentavos(payment.amount);

      if (
        !Number.isSafeInteger(paymentCentavos) ||
        paymentCentavos < 0
      ) {
        fail("load");
      }

      paidCentavos += paymentCentavos;
    }

    if (!Number.isSafeInteger(paidCentavos)) {
      fail("load");
    }

    if (paymentRows.length < pageSize) {
      break;
    }
  }

  const remainingCentavos = Math.max(
    0,
    totalCentavos - paidCentavos,
  );

  if (amountCentavos > remainingCentavos) {
    fail("exceeds");
  }

  // The database rechecks the balance while holding the sale lock.
  // This is the authoritative check for simultaneous requests.
  const { error: paymentError } = await supabase.rpc(
    "apex_add_sale_payment",
    {
      p_sale_id: sale_id,
      p_payment_type: payment_type,
      p_amount: amountCentavos / 100,
      p_payment_date: payment_date,
      p_payment_method: payment_method,
      p_bank_id: bank_id,
    },
  );

  if (paymentError) {
    console.error("Payment insert failed:", paymentError.message);

    const errorCodes: Record<string, string> = {
      APEX_PERMISSION: "permission",
      APEX_INVALID: "invalid",
      APEX_BANK: "bank",
      APEX_LOAD: "load",
      APEX_EXCEEDS: "exceeds",
    };

    fail(errorCodes[paymentError.message] ?? "save");
  }

  revalidatePath(returnTo);
  revalidatePath("/sales");
  revalidatePath("/dashboard");

  redirect(`${returnTo}?success=1`);
}