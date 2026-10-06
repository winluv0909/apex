import "server-only";

import { createClient } from "@/lib/supabase/server";

export const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export const BANKS = [
  "BDO", "METROBANK", "SECURITY BANK", "BPI", "UNION BANK", "GCASH",
];

export type Row = Record<
  string,
  string | number | boolean | null
>;

export function pesos(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

export function manilaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

type Client = Awaited<ReturnType<typeof createClient>>;

export async function readRows(
  client: Client,
  table: string,
  yearColumn?: string,
  year?: number,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let offset = 0; ; offset += 1000) {
    let query = client
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 999);

    if (yearColumn && year !== undefined) {
      query = query.eq(yearColumn, year);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not load ${table}: ${error.message}`);
    }

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < 1000) break;
  }

  return rows;
}

function cents(value: unknown) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    throw new Error("A dashboard record has an invalid amount.");
  }

  const centavos = Math.round(amount * 100);

  if (!Number.isSafeInteger(centavos)) {
    throw new Error("A dashboard record exceeds the supported amount.");
  }

  return centavos;
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("_", " ");
}

function bankName(value: unknown) {
  const name = normalized(value);

  if (name === "METRO BANK") return "METROBANK";
  if (name === "UNIONBANK") return "UNION BANK";
  if (name === "SECURITYBANK") return "SECURITY BANK";

  return name;
}

function benefitName(value: unknown) {
  const name = normalized(value).replaceAll("-", "").replaceAll(" ", "");

  if (name === "PAGIBIG") return "PAG-IBIG";
  return name;
}

function transactionDate(
  value: unknown,
  category: string,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = String(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`A ${category} record has an invalid transaction date.`);
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`A ${category} record has an invalid transaction date.`);
  }

  return date;
}

export async function loadDashboard(
  client: Client,
  year: number,
  month: number,
) {
  const [
    sales,
    payments,
    expenses,
    salaries,
    incentives,
    benefits,
    advances,
    repayments,
    manual,
    banks,
  ] = await Promise.all([
    readRows(client, "sales", "sale_year", year),
    readRows(client, "sale_payments"),
    // Load all accounting years because actual payments can cross years.
    readRows(client, "expenses"),
    readRows(client, "salaries"),
    readRows(client, "incentives"),
    readRows(client, "benefits"),
    readRows(client, "cash_advances"),
    readRows(client, "cash_advance_repayments"),
    readRows(client, "agent_monthly_sales", "sales_year", year),
    readRows(client, "banks"),
  ]);

  const today = manilaToday();

  const monthly = MONTHS.map((name) => ({
    month: name.slice(0, 3),
    sales: 0,
    profitSales: 0,
    vat: 0,
    withholding: 0,
    operational: 0,
    capital: 0,
    salaries: 0,
    commission: 0,
    incentives: 0,
    benefits: 0,
    collections: 0,
    outflows: 0,
    net: 0,
    profit: 0,
    active: false,
  }));

  const summary = {
    totalSales: 0,
    baseSales: 0,
    vat: 0,
    withholding: 0,
    netSales: 0,
    profit: 0,
    deductions: 0,
    downPayment: 0,
    fullPayment: 0,
    received: 0,
    outstanding: 0,
    operational: 0,
    capital: 0,
    salaries: 0,
    commission: 0,
    incentives: 0,
    advanceIssued: 0,
    advanceBalance: 0,
    recordCount: 0,
  };

  const benefitTotals: Record<string, number> = {
    SSS: 0,
    "PAG-IBIG": 0,
    PHILHEALTH: 0,
    HMO: 0,
  };

  const bankTotals: Record<string, number> =
    Object.fromEntries(BANKS.map((name) => [name, 0]));

  const bankNames = new Map(
    banks.map((row) => [
      String(row.id),
      bankName(row.name),
    ]),
  );

  function updateBank(
    bankId: unknown,
    method: unknown,
    amount: number,
  ) {
    if (normalized(method) === "CASH" || bankId == null) return;

    const name = bankNames.get(String(bankId));

    if (name && name in bankTotals) {
      bankTotals[name] += amount;
    }
  }

  const included = (value: unknown) =>
    month === 0 || Number(value) === month;

  function cashMonth(
    value: unknown,
    category: string,
  ): number | null {
    const date = transactionDate(value, category);

    // Undated transactions are excluded from dated cash totals,
    // matching the PDF report's date filters.
    if (
      date === null ||
      date > today ||
      Number(date.slice(0, 4)) !== year
    ) {
      return null;
    }

    return Number(date.slice(5, 7));
  }

  function recordOutflow(
    row: Row,
    dateColumn: string,
    category: string,
    amount: number,
    bankColumn = "bank_id",
  ) {
    const monthNumber = cashMonth(row[dateColumn], category);

    if (monthNumber === null) return;

    monthly[monthNumber - 1].outflows += amount;

    if (included(monthNumber)) {
      updateBank(row[bankColumn], row.payment_method, -amount);
    }
  }

  const paid = new Map<string, number>();

  for (const payment of payments) {
    const id = String(payment.sale_id);
    const amount = cents(payment.amount);

    // All payments contribute to the sale's current outstanding balance.
    paid.set(id, (paid.get(id) ?? 0) + amount);

    // Received funds belong to the actual payment date.
    const paymentMonth = cashMonth(
      payment.payment_date,
      "sale payment",
    );

    if (paymentMonth === null) continue;

    monthly[paymentMonth - 1].collections += amount;

    if (!included(paymentMonth)) continue;

    summary.received += amount;

    if (payment.payment_type === "down_payment") {
      summary.downPayment += amount;
    }

    if (payment.payment_type === "final_payment") {
      summary.fullPayment += amount;
    }

    updateBank(payment.bank_id, payment.payment_method, amount);
  }

  const customerTotals = new Map<string, number>();
  const agentTotals = new Map<string, number>();
  const agentMonths = new Map<string, number[]>();

  function rank(
    target: Map<string, number>,
    nameValue: unknown,
    amount: number,
  ) {
    const name = String(nameValue ?? "").trim();

    if (name && amount !== 0) {
      target.set(name, (target.get(name) ?? 0) + amount);
    }
  }

  function addAgentMonth(
    nameValue: unknown,
    monthNumber: number,
    amount: number,
  ) {
    const name = String(nameValue ?? "").trim();

    if (!name || monthNumber < 1 || monthNumber > 12) return;

    const values = agentMonths.get(name) ?? Array<number>(12).fill(0);
    values[monthNumber - 1] += amount;
    agentMonths.set(name, values);
  }

  for (const sale of sales) {
    const base = cents(sale.base_amount);
    const vat = cents(sale.vat_amount);
    const tax = cents(sale.withholding_amount);
    const gross = base + vat;
    const monthNumber = Number(sale.sale_month);
    const bucket = monthly[monthNumber - 1];
    const received = paid.get(String(sale.id)) ?? 0;

    if (bucket) {
      bucket.sales += gross;
      bucket.profitSales += gross;
      bucket.vat += vat;
      bucket.withholding += tax;
    }

    rank(customerTotals, sale.customer_name, gross);
    rank(agentTotals, sale.agent_name, gross);
    addAgentMonth(sale.agent_name, monthNumber, gross);

    if (!included(monthNumber)) continue;

    summary.recordCount++;
    summary.totalSales += gross;
    summary.baseSales += base;
    summary.vat += vat;
    summary.withholding += tax;
    summary.outstanding += Math.max(0, gross - tax - received);
  }

  // Manual agent inputs affect the monthly sales and agent chart,
  // following the spreadsheet. They do not increase profit or rankings.
  for (const row of manual) {
    const monthNumber = Number(row.sales_month);
    const amount = cents(row.amount);

    if (monthly[monthNumber - 1]) {
      monthly[monthNumber - 1].sales += amount;
      addAgentMonth(row.agent_name, monthNumber, amount);
    }
  }

  for (const expense of expenses) {
    const amount = cents(expense.amount);
    const key = expense.expense_type === "capital"
      ? "capital"
      : "operational";

    // Cash movement follows the expense date, regardless of accounting year.
    recordOutflow(expense, "expense_date", "expense", amount);

    if (Number(expense.expense_year) !== year) continue;

    const bucket = monthly[Number(expense.expense_month) - 1];

    if (bucket) {
      bucket[key] += amount;
    }

    if (included(expense.expense_month)) {
      summary[key] += amount;
    }
  }

  for (const salary of salaries) {
    const amount = cents(salary.amount);

    recordOutflow(salary, "payment_date", "salary", amount);

    if (Number(salary.salary_year) !== year) continue;

    const bucket = monthly[Number(salary.salary_month) - 1];

    if (bucket) {
      bucket.salaries += amount;
    }

    if (included(salary.salary_month)) {
      summary.salaries += amount;
    }
  }

  for (const incentive of incentives) {
    const amount = cents(incentive.amount);
    const key = normalized(incentive.incentive_type) === "SALES INCENTIVE"
      ? "commission"
      : "incentives";

    recordOutflow(incentive, "payment_date", "incentive", amount);

    if (Number(incentive.incentive_year) !== year) continue;

    const bucket = monthly[Number(incentive.incentive_month) - 1];

    if (bucket) {
      bucket[key] += amount;
    }

    if (included(incentive.incentive_month)) {
      summary[key] += amount;
    }
  }

  let selectedBenefits = 0;

  for (const benefit of benefits) {
    const amount = benefit.total_contribution == null
      ? cents(benefit.employee_contribution) +
        cents(benefit.employer_contribution)
      : cents(benefit.total_contribution);

    // Corrects the spreadsheet's missing benefit bank deduction,
    // using the actual contribution payment date.
    recordOutflow(benefit, "payment_date", "benefit", amount);

    if (Number(benefit.benefit_year) !== year) continue;

    const bucket = monthly[Number(benefit.benefit_month) - 1];

    if (bucket) {
      bucket.benefits += amount;
    }

    if (included(benefit.benefit_month)) {
      const name = benefitName(benefit.benefit_type);
      benefitTotals[name] = (benefitTotals[name] ?? 0) + amount;
      selectedBenefits += amount;
    }
  }

  const advanceById = new Map(
    advances.map((row) => [String(row.id), row]),
  );
  const repaidToCutoff = new Map<string, number>();

  const cutoff = new Date(
    Date.UTC(year, month === 0 ? 12 : month, 0),
  ).toISOString().slice(0, 10);

  for (const repayment of repayments) {
    const advance = advanceById.get(String(repayment.cash_advance_id));

    if (!advance) {
      throw new Error(
        "A repayment's cash advance could not be loaded.",
      );
    }

    if (advance.is_declined) continue;

    const amount = cents(repayment.amount);
    const date = transactionDate(
      repayment.payment_date,
      "cash advance repayment",
    );

    // Preserve the existing accounting fallback for advance balances.
    // Undated repayments are not included in dated cash collections.
    const repaymentYear = date
      ? Number(date.slice(0, 4))
      : Number(advance.advance_year);
    const repaymentMonth = date
      ? Number(date.slice(5, 7))
      : Number(advance.advance_month);

    const withinCutoff = date
      ? date <= cutoff
      : repaymentYear < year ||
        (repaymentYear === year &&
          repaymentMonth <= (month || 12));

    if (withinCutoff) {
      const id = String(advance.id);
      repaidToCutoff.set(id, (repaidToCutoff.get(id) ?? 0) + amount);
    }

    const collectionMonth = cashMonth(
      repayment.payment_date,
      "cash advance repayment",
    );

    if (collectionMonth === null) continue;

    monthly[collectionMonth - 1].collections += amount;

    if (included(collectionMonth)) {
      bankTotals.BDO += amount;
    }
  }

  for (const advance of advances) {
    if (advance.is_declined) continue;

    const amount = cents(advance.amount);

    recordOutflow(
      advance,
      "issue_date",
      "cash advance",
      amount,
      "disbursement_bank_id",
    );

    if (Number(advance.advance_year) !== year) continue;

    if (included(advance.advance_month)) {
      summary.advanceIssued += amount;
      summary.advanceBalance += Math.max(
        0,
        amount - (repaidToCutoff.get(String(advance.id)) ?? 0),
      );
    }
  }

  for (const bucket of monthly) {
    const deductions =
      bucket.withholding + bucket.vat +
      bucket.operational + bucket.capital +
      bucket.salaries + bucket.commission +
      bucket.incentives + bucket.benefits;

    bucket.profit = bucket.profitSales - deductions;
    bucket.net = bucket.collections - bucket.outflows;
    bucket.active = [
      bucket.profitSales, bucket.withholding, bucket.vat,
      bucket.operational, bucket.capital, bucket.salaries,
      bucket.commission, bucket.incentives, bucket.benefits,
      bucket.collections, bucket.outflows,
    ].some((value) => value !== 0);
  }

  summary.netSales = summary.totalSales - summary.withholding;

  summary.profit =
    summary.netSales - summary.vat -
    summary.operational - summary.capital -
    summary.salaries - summary.commission -
    summary.incentives - selectedBenefits;

  summary.deductions = summary.totalSales - summary.profit;

  function topFive(target: Map<string, number>) {
    return [...target.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));
  }

  const agentSeries = [...agentMonths.entries()]
    .sort((a, b) =>
      b[1].reduce((sum, value) => sum + value, 0) -
      a[1].reduce((sum, value) => sum + value, 0),
    )
    .map(([name, values], index) => ({
      key: `agent_${index}`,
      name,
      values,
    }));

  const lastWeekday = new Date(Date.UTC(year, 11, 31));

  while (
    lastWeekday.getUTCDay() === 0 ||
    lastWeekday.getUTCDay() === 6
  ) {
    lastWeekday.setUTCDate(lastWeekday.getUTCDate() - 1);
  }

  const annualReleaseDate = lastWeekday.toISOString().slice(0, 10);

  return {
    summary,
    benefitTotals,
    bankTotals,
    monthly,
    topCustomers: topFive(customerTotals),
    topAgents: topFive(agentTotals),
    agentSeries,
    annualReady: manilaToday() > annualReleaseDate,
    annualReleaseDate,
  };
}

export type DashboardData =
  Awaited<ReturnType<typeof loadDashboard>>;