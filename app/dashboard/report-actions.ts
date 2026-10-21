"use server";

import { canViewDashboard } from "@/lib/permissions";

import { createClient } from "@/lib/supabase/server";

export type ReportPeriod = "daily" | "monthly" | "annual";

export type ReportRequest = {
  period: ReportPeriod;
  date?: string;
  year?: number;
  month?: number;
};

export type DailyTransaction = {
  reference: string;
  date: string;
  category: string;
  description: string;
  account: string;
  direction: "in" | "out";
  centavos: number;
};

export type DailyReport = {
  date: string;
  period: ReportPeriod;
  label: string;
  startDate: string;
  endDate: string;
  throughDate: string;
  generatedAt: string;
  preparedBy: string;
  provisional: boolean;
  incoming: number;
  outgoing: number;
  net: number;
  transactions: DailyTransaction[];
  accounts: {
    name: string;
    incoming: number;
    outgoing: number;
    net: number;
  }[];
};

type Row = {
  id: string | number;
  name?: string;
  amount?: number | string | null;
  total_contribution?: number | string | null;
  bank_id?: number | null;
  disbursement_bank_id?: number | null;
  payment_method?: string | null;
  payment_type?: string;
  payment_date?: string | null;
  expense_date?: string | null;
  issue_date?: string | null;
  sale_id?: string;
  cash_advance_id?: string;
  recipient_name?: string;
  employee_name?: string;
  description?: string;
  expense_type?: string;
  incentive_type?: string;
  benefit_type?: string;
  is_declined?: boolean;
};

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function reportRange(request: ReportRequest, today: string) {
  if (request.period === "daily") {
    const date = request.date ?? "";

    if (!validDate(date) || date > today) {
      throw new Error("Choose a valid date up to today.");
    }

    return {
      startDate: date,
      endDate: date,
      label: date,
    };
  }

  if (
    request.period !== "monthly" &&
    request.period !== "annual"
  ) {
    throw new Error("Choose Daily, Monthly, or Annual.");
  }

  const year = request.year;
  const currentYear = Number(today.slice(0, 4));

  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 2026 ||
    year > currentYear
  ) {
    throw new Error(
      `Choose a year between 2026 and ${currentYear}.`,
    );
  }

  if (request.period === "annual") {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: String(year),
    };
  }

  const month = request.month;

  if (
    typeof month !== "number" ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error("Choose a valid month.");
  }

  const monthText = String(month).padStart(2, "0");
  const startDate = `${year}-${monthText}-01`;

  if (startDate > today) {
    throw new Error("Choose the current month or an earlier month.");
  }

  const lastDay = new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate();

  return {
    startDate,
    endDate: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("en-PH", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }).format(new Date(`${startDate}T00:00:00Z`)),
  };
}

// Preserve the existing daily report action.
export async function generateDailyReport(
  date: string,
): Promise<DailyReport> {
  return generateFinancialReport({
    period: "daily",
    date,
  });
}

export async function generateFinancialReport(
  request: ReportRequest,
): Promise<DailyReport> {
  const supabase = await createClient();

  const { data: auth, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !auth?.claims?.sub) {
    throw new Error("Please sign in again.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", auth.claims.sub)
    .single();

  if (profileError || !profile || !canViewDashboard(profile.role)) {
    throw new Error("Only authorized APEX owners and viewers can generate reports.");
  }

  const today = manilaToday();
  const { startDate, endDate, label } = reportRange(request, today);
  const throughDate = endDate > today ? today : endDate;

  // Fetch every page so reports are not limited to 1,000 records.
  async function readRows(
    table: string,
    dateColumn?: string,
    ids?: string[],
  ): Promise<Row[]> {
    const rows: Row[] = [];

    for (let offset = 0; ; offset += 1000) {
      let query = supabase
        .from(table)
        .select("*")
        .order("id")
        .range(offset, offset + 999);

      if (dateColumn) {
        query = query
          .gte(dateColumn, startDate)
          .lte(dateColumn, throughDate);
      }

      if (ids) {
        query = query.in("id", ids);
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

  const [
    banks,
    payments,
    expenses,
    salaries,
    incentives,
    benefits,
    advances,
    repayments,
  ] = await Promise.all([
    readRows("banks"),
    readRows("sale_payments", "payment_date"),
    readRows("expenses", "expense_date"),
    readRows("salaries", "payment_date"),
    readRows("incentives", "payment_date"),
    readRows("benefits", "payment_date"),
    readRows("cash_advances", "issue_date"),
    readRows("cash_advance_repayments", "payment_date"),
  ]);

  // Check the parent advance before counting a repayment.
  const repaymentIds = [
    ...new Set(
      repayments
        .map((row) => row.cash_advance_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const repaymentParents = new Map<string, Row>();

  for (let start = 0; start < repaymentIds.length; start += 100) {
    const parents = await readRows(
      "cash_advances",
      undefined,
      repaymentIds.slice(start, start + 100),
    );

    for (const parent of parents) {
      repaymentParents.set(String(parent.id), parent);
    }
  }

  const bankNames = new Map(
    banks.map((bank) => [
      String(bank.id),
      bank.name ?? "Unnamed bank",
    ]),
  );

  function account(row: Row, advance = false) {
    if (
      String(row.payment_method ?? "").trim().toUpperCase() === "CASH"
    ) {
      return "Cash";
    }

    const bankId = advance
      ? row.disbursement_bank_id
      : row.bank_id;

    return bankId == null
      ? "Unassigned account"
      : bankNames.get(String(bankId)) ?? "Unknown bank";
  }

  const transactions: DailyTransaction[] = [];

  function add(
    row: Row,
    category: string,
    direction: "in" | "out",
    description: string,
    accountName: string,
    amount = row.amount,
  ) {
    const numeric = Number(amount ?? 0);

    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid amount in ${category}.`);
    }

    const centavos = Math.round(numeric * 100);

    if (centavos === 0) return;

    if (centavos < 0 || !Number.isSafeInteger(centavos)) {
      throw new Error(`Invalid amount in ${category}.`);
    }

    const transactionDate =
      row.payment_date ?? row.expense_date ?? row.issue_date ?? "";

    if (!validDate(transactionDate)) {
      throw new Error(`Invalid transaction date in ${category}.`);
    }

    transactions.push({
      reference: String(row.id),
      date: transactionDate,
      category,
      description,
      account: accountName,
      direction,
      centavos,
    });
  }

  for (const row of payments) {
    add(
      row,
      row.payment_type === "down_payment"
        ? "Down payment"
        : row.payment_type === "final_payment"
          ? "Final payment"
          : "Sales payment",
      "in",
      `Sale ${row.sale_id ?? ""}`,
      account(row),
    );
  }

  for (const row of expenses) {
    add(
      row,
      row.expense_type === "capital"
        ? "Capital expense"
        : "Operational expense",
      "out",
      row.description || "Expense",
      account(row),
    );
  }

  for (const row of salaries) {
    add(
      row,
      "Salary",
      "out",
      row.employee_name || row.description || "Salary payment",
      account(row),
    );
  }

  for (const row of incentives) {
    const type = String(row.incentive_type ?? "")
      .trim()
      .toUpperCase()
      .replaceAll("_", " ");

    add(
      row,
      type === "SALES INCENTIVE" ? "Commission" : "Incentive",
      "out",
      row.recipient_name || "Incentive payment",
      account(row),
    );
  }

  for (const row of benefits) {
    add(
      row,
      `Benefit: ${row.benefit_type || "Contribution"}`,
      "out",
      row.employee_name || "Benefit payment",
      account(row),
      row.total_contribution,
    );
  }

  for (const row of advances) {
    if (row.is_declined) continue;

    add(
      row,
      "Cash advance issued",
      "out",
      row.recipient_name || "Cash advance",
      account(row, true),
    );
  }

  for (const row of repayments) {
    const parent = repaymentParents.get(
      String(row.cash_advance_id),
    );

    if (!parent) {
      throw new Error(
        "A repayment's cash advance could not be loaded.",
      );
    }

    if (parent.is_declined) continue;

    add(
      row,
      "Cash advance repayment",
      "in",
      parent.recipient_name || "Repayment",
      "BDO",
    );
  }

  transactions.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.category.localeCompare(b.category) ||
      a.reference.localeCompare(b.reference),
  );

  let incoming = 0;
  let outgoing = 0;

  const accountTotals = new Map<
    string,
    {
      name: string;
      incoming: number;
      outgoing: number;
      net: number;
    }
  >();

  for (const transaction of transactions) {
    const total = accountTotals.get(transaction.account) ?? {
      name: transaction.account,
      incoming: 0,
      outgoing: 0,
      net: 0,
    };

    if (transaction.direction === "in") {
      incoming += transaction.centavos;
      total.incoming += transaction.centavos;
    } else {
      outgoing += transaction.centavos;
      total.outgoing += transaction.centavos;
    }

    if (
      !Number.isSafeInteger(incoming) ||
      !Number.isSafeInteger(outgoing) ||
      !Number.isSafeInteger(total.incoming) ||
      !Number.isSafeInteger(total.outgoing)
    ) {
      throw new Error("Report totals exceed the supported amount.");
    }

    total.net = total.incoming - total.outgoing;
    accountTotals.set(transaction.account, total);
  }

  return {
    date: startDate,
    period: request.period,
    label,
    startDate,
    endDate,
    throughDate,
    generatedAt: new Date().toISOString(),
    preparedBy: profile.full_name || "APEX user",
    provisional: endDate >= today,
    incoming,
    outgoing,
    net: incoming - outgoing,
    transactions,
    accounts: [...accountTotals.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}