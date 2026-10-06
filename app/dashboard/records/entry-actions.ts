"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EntryState = {
  success: boolean;
  error: string;
};

const TABLES: Record<string, { table: string; prefix: string }> = {
  benefits: { table: "benefits", prefix: "benefit" },
  salaries: { table: "salaries", prefix: "salary" },
  incentives: { table: "incentives", prefix: "incentive" },
  "cash-advance": { table: "cash_advances", prefix: "advance" },
};

const PAYOUTS: Record<string, string> = {
  Weekly: "Saturday to Friday",
  "15th Payout": "1 to 15 of the month",
  "30th / 31st Payout": "16 to 30/31 of the month",
};

function text(form: FormData, field: string, required = true) {
  const value = String(form.get(field) ?? "").trim();

  if ((required && !value) || value.length > 500) {
    throw new Error(`Check the ${field.replaceAll("_", " ")} field.`);
  }

  return value;
}

function money(form: FormData, field: string, allowZero = false) {
  const value = text(form, field);

  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("Amounts must have at most two decimal places.");
  }

  const amount = Number(value);
  const centavos = Math.round(amount * 100);

  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(centavos) ||
    amount < 0 ||
    (!allowZero && amount === 0)
  ) {
    throw new Error("Enter a valid positive amount.");
  }

  return amount;
}

function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function paymentDate(form: FormData) {
  const value = text(form, "date");
  const parsed = new Date(`${value}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < "2026-01-01" ||
    value > today()
  ) {
    throw new Error("Choose a valid date from 2026 up to today.");
  }

  return value;
}

async function authorizedClient() {
  const client = await createClient();
  const { data: auth, error: authError } =
    await client.auth.getClaims();

  if (authError || !auth?.claims?.sub) {
    throw new Error("Please sign in again.");
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.claims.sub)
    .single();

  if (
    error ||
    !profile ||
    profile.role !== "owner"
  ) {
    throw new Error("Your account cannot add entries.");
  }

  return client;
}

function refresh(tab: string) {
  revalidatePath(`/dashboard/records/${tab}`);
  revalidatePath("/dashboard");
}

export async function saveEntry(
  tab: string,
  _previous: EntryState,
  form: FormData,
): Promise<EntryState> {
  try {
    if (!Object.prototype.hasOwnProperty.call(TABLES, tab)) {
      throw new Error("Invalid entry page.");
    }

    const client = await authorizedClient();
    const config = TABLES[tab];

    const year = Number(text(form, "year"));
    const month = Number(text(form, "month"));

    if (
      !Number.isInteger(year) ||
      year < 2026 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new Error("Select a valid accounting month and year.");
    }

    const date = paymentDate(form);
    const method = text(form, "payment_method");

    if (!["CASH", "BANK TRANSFER"].includes(method)) {
      throw new Error("Select Cash or Bank Transfer.");
    }

    let bankId: number | null = null;

    if (method === "BANK TRANSFER") {
      bankId = Number(text(form, "bank_id"));

      if (!Number.isSafeInteger(bankId) || bankId <= 0) {
        throw new Error("Select the bank used for this transfer.");
      }

      const { data: bank, error } = await client
        .from("banks")
        .select("id")
        .eq("id", bankId)
        .single();

      if (error || !bank) {
        throw new Error("The selected bank could not be found.");
      }
    }

    const record: Record<string, string | number | boolean | null> = {
      [`${config.prefix}_year`]: year,
      [`${config.prefix}_month`]: month,
      payment_method: method,
    };

    if (tab === "benefits") {
      const type = text(form, "benefit_type");

      if (!["SSS", "PAG-IBIG", "PHILHEALTH", "HMO"].includes(type)) {
        throw new Error("Select a valid benefit type.");
      }

      const employee = money(form, "employee_contribution", true);
      const employer = money(form, "employer_contribution", true);

      if (
        Math.round(employee * 100) + Math.round(employer * 100) <= 0
      ) {
        throw new Error("The combined contribution must exceed zero.");
      }

      Object.assign(record, {
        benefit_type: type,
        employee_name: text(form, "name"),
        employee_contribution: employee,
        employer_contribution: employer,
        payment_date: date,
        bank_id: bankId,
      });

      // total_contribution is calculated by the database.
    }

    if (tab === "salaries") {
      const payoutType = text(form, "payout_type");
      const cutOffPeriod = text(form, "cut_off_period");

      if (
        !Object.prototype.hasOwnProperty.call(PAYOUTS, payoutType) ||
        PAYOUTS[payoutType] !== cutOffPeriod
      ) {
        throw new Error("The cutoff period must match the payout type.");
      }

      const basic = money(form, "basic_salary", true);
      const allowance = money(form, "total_allowance", true);
      const sss = money(form, "sss_deduction", true);
      const pagibig = money(form, "pagibig_deduction", true);
      const philhealth = money(form, "philhealth_deduction", true);
      const hmo = money(form, "hmo_deduction", true);

      const grossCentavos =
        Math.round(basic * 100) + Math.round(allowance * 100);

      const deductionCentavos =
        Math.round(sss * 100) +
        Math.round(pagibig * 100) +
        Math.round(philhealth * 100) +
        Math.round(hmo * 100);

      const netCentavos = grossCentavos - deductionCentavos;

      if (
        !Number.isSafeInteger(grossCentavos) ||
        !Number.isSafeInteger(deductionCentavos) ||
        !Number.isSafeInteger(netCentavos) ||
        netCentavos <= 0
      ) {
        throw new Error(
          "Net salary must exceed zero. Check the salary and deductions.",
        );
      }

      Object.assign(record, {
        employee_name: text(form, "name"),
        description: text(form, "description", false) || null,
        cut_off_period: cutOffPeriod,
        payout_type: payoutType,
        position: text(form, "position"),
        basic_salary: basic,
        total_allowance: allowance,
        sss_deduction: sss,
        pagibig_deduction: pagibig,
        philhealth_deduction: philhealth,
        hmo_deduction: hmo,
        // Keep the existing dashboard/report connection:
        // salaries.amount contains the actual net salary paid.
        amount: netCentavos / 100,
        payment_date: date,
        bank_id: bankId,
        status: "PAID",
      });
    }

    if (tab === "incentives") {
      Object.assign(record, {
        recipient_name: text(form, "name"),
        incentive_type: text(form, "incentive_type"),
        reference: text(form, "reference", false) || null,
        notes: text(form, "notes", false) || null,
        amount: money(form, "amount"),
        payment_date: date,
        bank_id: bankId,
      });
    }

    if (tab === "cash-advance") {
      Object.assign(record, {
        recipient_name: text(form, "name"),
        purpose: text(form, "purpose", false) || null,
        amount: money(form, "amount"),
        issue_date: date,
        disbursement_bank_id: bankId,
        is_declined: form.get("is_declined") === "on",
      });
    }

    const { error } = await client.from(config.table).insert(record);

    if (error) {
      console.error(`${config.table} insert failed:`, error);
      throw new Error(`Save failed: ${error.message}`);
    }

    refresh(tab);
    return { success: true, error: "" };
  } catch (cause) {
    return {
      success: false,
      error: cause instanceof Error ? cause.message : "Could not save.",
    };
  }
}

export async function saveRepayment(
  _previous: EntryState,
  form: FormData,
): Promise<EntryState> {
  try {
    const client = await authorizedClient();
    const advanceId = text(form, "advance_id");

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        advanceId,
      )
    ) {
      throw new Error("Select a valid cash advance.");
    }

    const { error } = await client.rpc(
      "apex_add_cash_advance_repayment",
      {
        p_advance_id: advanceId,
        p_amount: money(form, "amount"),
        p_payment_date: paymentDate(form),
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    refresh("cash-advance");
    return { success: true, error: "" };
  } catch (cause) {
    return {
      success: false,
      error: cause instanceof Error
        ? cause.message
        : "Could not save the repayment.",
    };
  }
}