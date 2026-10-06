"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function addExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();

  if (!auth?.claims?.sub) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.claims.sub)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "owner"
  ) {
    redirect("/expenses?error=permission");
  }

  const expense_type = String(formData.get("expense_type") ?? "");
  const expense_month = Number(formData.get("expense_month"));
  const expense_year = Number(formData.get("expense_year"));
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const payment_method = String(formData.get("payment_method") ?? "");
  const amountText = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountText);
  const bankId = Number(formData.get("bank_id"));

  const receiver = String(formData.get("receiver") ?? "").trim();
  const supplier_name = String(formData.get("supplier_name") ?? "").trim();
  const company_name = String(formData.get("company_name") ?? "").trim();
  const tin_no = String(formData.get("tin_no") ?? "").trim();
  const company_address = String(
    formData.get("company_address") ?? "",
  ).trim();
  const receipt_no = String(formData.get("receipt_no") ?? "").trim();
  const tax_classification = String(
    formData.get("tax_classification") ?? "",
  ).trim();

  const returnTo = ["operational", "capital"].includes(expense_type)
    ? `/expenses?type=${expense_type}`
    : "/expenses";

  function fail(code: string): never {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${code}`,
    );
  }

  if (
    !["operational", "capital"].includes(expense_type) ||
    !Number.isInteger(expense_month) ||
    expense_month < 1 ||
    expense_month > 12 ||
    !Number.isInteger(expense_year) ||
    expense_year < 2026 ||
    expense_year > 2100 ||
    !category ||
    !/^\d+(\.\d{1,2})?$/.test(amountText) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100)) ||
    !["CASH", "BANK TRANSFER"].includes(payment_method) ||
    (payment_method === "BANK TRANSFER" &&
      (!Number.isSafeInteger(bankId) || bankId <= 0)) ||
    !["VATABLE", "NON-VATABLE"].includes(tax_classification) ||
    [
      category,
      description,
      receiver,
      supplier_name,
      company_name,
      tin_no,
      company_address,
      receipt_no,
    ].some((value) => value.length > 500)
  ) {
    fail("invalid");
  }

  if (!expense_date) fail("invalid");

  // Check that an entered date is a real calendar date.
  if (expense_date) {
    const parsedDate = new Date(`${expense_date}T00:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expense_date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== expense_date
    ) {
      fail("invalid");
    }
  }

  if (payment_method === "BANK TRANSFER") {
    const { data: bank, error: bankError } = await supabase
      .from("banks")
      .select("id")
      .eq("id", bankId)
      .single();

    if (bankError || !bank) fail("bank");
  }

  const { error } = await supabase.from("expenses").insert({
    expense_type,
    expense_month,
    expense_year,
    category,
    description: description || null,
    expense_date: expense_date || null,
    amount,
    payment_method,
    bank_id: payment_method === "BANK TRANSFER" ? bankId : null,
    receiver: receiver || null,
    supplier_name: supplier_name || null,
    company_name: company_name || null,
    tin_no: tin_no || null,
    company_address: company_address || null,
    receipt_no: receipt_no || null,
    tax_classification,
  });

  if (error) {
    console.error("Expense insert failed:", error.message);
    fail("save");
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect(`${returnTo}&success=1`);
}