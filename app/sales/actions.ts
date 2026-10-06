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

export type SaleState = {
  error: string;
};

function text(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function validMoney(value: string) {
  const amount = Number(value);

  return (
    /^\d+(\.\d{1,2})?$/.test(value) &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 999999999999.99 &&
    Number.isSafeInteger(Math.round(amount * 100))
  );
}

async function insertSale(formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { data: claims, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !claims?.claims?.sub) {
    redirect("/login");
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
    return "You do not have permission to add sales.";
  }

  const sale_month = Number(formData.get("sale_month"));
  const sale_year = Number(formData.get("sale_year"));
  const sale_type = text(formData, "sale_type");
  const agent_name = text(formData, "agent_name");
  const customer_name = text(formData, "customer_name");
  const company_name = text(formData, "company_name");
  const tin_no = text(formData, "tin_no");
  const company_address = text(formData, "company_address");
  const base_amount = text(formData, "base_amount");

  const withholding_rate =
    sale_type === "vatable_with_withholding"
      ? text(formData, "withholding_rate")
      : "0";

  if (
    !Number.isInteger(sale_month) ||
    sale_month < 1 ||
    sale_month > MONTHS.length ||
    !Number.isInteger(sale_year) ||
    sale_year < 2026 ||
    sale_year > 2100 ||
    !SALE_TYPES.includes(sale_type) ||
    !agent_name ||
    !customer_name ||
    [
      agent_name,
      customer_name,
      company_name,
      tin_no,
      company_address,
    ].some((value) => value.length > 500) ||
    !validMoney(base_amount) ||
    Number(base_amount) <= 0 ||
    !/^\d+(\.\d{1,4})?$/.test(withholding_rate) ||
    Number(withholding_rate) < 0 ||
    Number(withholding_rate) > 100
  ) {
    return "Check the sale fields and enter valid amounts.";
  }

  const payments: {
    payment_type: string;
    amount: string;
    payment_date: string;
    payment_method: string;
    bank_id: string | null;
  }[] = [];

  for (const prefix of ["down_payment", "final_payment"]) {
    const amount = text(formData, `${prefix}_amount`);

    if (!amount) continue;

    if (!validMoney(amount)) {
      return "Enter valid payment amounts with up to two decimals.";
    }

    if (Number(amount) === 0) continue;

    const payment_method = text(formData, `${prefix}_method`);
    const payment_date = text(formData, `${prefix}_date`);
    const bank_id = text(formData, `${prefix}_bank_id`);

    if (!["CASH", "BANK TRANSFER"].includes(payment_method)) {
      return (
        "Installment terms are preserved in the dropdown, but their " +
        "schedule and receiving account are not connected yet. " +
        "Choose Cash or Bank Transfer for money already received."
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return "Enter the date for each payment received.";
    }

    if (
      payment_method === "BANK TRANSFER" &&
      !/^\d+$/.test(bank_id)
    ) {
      return "Choose the receiving bank for each bank transfer.";
    }

    payments.push({
      payment_type: prefix,
      amount,
      payment_date,
      payment_method,
      bank_id: payment_method === "BANK TRANSFER" ? bank_id : null,
    });
  }

  // A term selection without a payment also needs schedule support.
  for (const prefix of ["down_payment", "final_payment"]) {
    const method = text(formData, `${prefix}_method`);

    if (method.startsWith("INSTALLMENT TERM")) {
      return (
        "Installment schedules are not connected yet. " +
        "For this test, choose Cash or Bank Transfer."
      );
    }
  }

  const { data: saleId, error } = await supabase.rpc(
    "apex_save_sale_with_payments",
    {
      p_sale: {
        sale_month,
        sale_year,
        sale_type,
        agent_name,
        customer_name,
        company_name,
        tin_no,
        company_address,
        base_amount,
        withholding_rate,
      },
      p_payments: payments,
    },
  );

  if (error || !saleId) {
    console.error("Sale insert failed:", error?.message);

    if (error?.code === "P0001") {
      return error.message;
    }

    return (
      "Could not save the sale. Check that the " +
      "'APEX — Save Sale and Initial Payments' SQL query ran " +
      "successfully and that your account can insert sales and payments."
    );
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/dashboard");

  return null;
}

export async function addSale(formData: FormData) {
  const error = await insertSale(formData);
  const saleType = text(formData, "sale_type");
  const type = SALE_TYPES.includes(saleType)
    ? saleType
    : "non_vatable";

  if (error) {
    redirect(`/sales?type=${type}&error=save`);
  }

  redirect(`/sales?type=${type}&success=1`);
}

export async function saveSale(
  _previousState: SaleState,
  formData: FormData,
): Promise<SaleState> {
  const error = await insertSale(formData);

  if (error) {
    return { error };
  }

  const saleType = text(formData, "sale_type");
  const type = SALE_TYPES.includes(saleType)
    ? saleType
    : "non_vatable";

  redirect(`/sales?type=${type}&success=1`);
}