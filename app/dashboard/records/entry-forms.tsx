"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  saveEntry,
  saveRepayment,
  type EntryState,
} from "./entry-actions";

type Bank = { id: string; name: string };

type Advance = {
  id: string;
  name: string;
  balance: number;
};

type Props = {
  tab: string;
  title: string;
  banks: Bank[];
  advances: Advance[];
  year: number;
  month: number;
  today: string;
};

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const PAYOUTS = [
  { type: "Weekly", cutoff: "Saturday to Friday" },
  { type: "15th Payout", cutoff: "1 to 15 of the month" },
  {
    type: "30th / 31st Payout",
    cutoff: "16 to 30/31 of the month",
  },
];

const PAYROLL_FIELDS = [
  ["basic_salary", "BASIC SALARY"],
  ["total_allowance", "TOTAL ALLOWANCE"],
  ["sss_deduction", "SSS(DEDUCTION)"],
  ["pagibig_deduction", "PAGIBIG(DEDUCTION)"],
  ["philhealth_deduction", "PHILHEALTH(DEDUCTION)"],
  ["hmo_deduction", "HMO(DEDUCTION)"],
] as const;

function emptyPayroll(): Record<string, string> {
  return {
    basic_salary: "",
    total_allowance: "0",
    sss_deduction: "0",
    pagibig_deduction: "0",
    philhealth_deduction: "0",
    hmo_deduction: "0",
  };
}

const INITIAL: EntryState = { success: false, error: "" };
const control = "apex-control mt-2 w-full";

function currency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

function Feedback({ state }: { state: EntryState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[#b42318]"
      >
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
      >
        Saved successfully.
      </p>
    );
  }

  return null;
}

function RepaymentForm({
  advances,
  today,
}: {
  advances: Advance[];
  today: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] =
    useActionState(saveRepayment, INITIAL);

  useEffect(() => {
    if (state.success) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <details className="apex-panel mt-6">
      <summary className="cursor-pointer text-xl font-semibold text-[#082451]">
        + Add repayment
      </summary>

      <p className="apex-description">
        Repayments are received by BDO. The repayment number is
        assigned automatically.
      </p>

      {!advances.length ? (
        <p className="mt-5 text-[#52647d]">
          There are no outstanding, approved cash advances.
        </p>
      ) : (
        <form ref={form} action={action} className="mt-6">
          <fieldset
            disabled={pending}
            className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            <label className="font-medium">
              Cash advance
              <select
                name="advance_id"
                required
                defaultValue=""
                className={control}
              >
                <option value="" disabled>Select cash advance</option>
                {advances.map((advance) => (
                  <option key={advance.id} value={advance.id}>
                    {advance.name} · {currency(advance.balance)}
                    {" · "}{advance.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label className="font-medium">
              Repayment amount
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                className={control}
              />
            </label>

            <label className="font-medium">
              Payment date
              <input
                name="date"
                type="date"
                min="2026-01-01"
                max={today}
                defaultValue={today}
                required
                className={control}
              />
            </label>

            <button
              type="submit"
              className="rounded-xl bg-[#082451] px-6 py-3 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save repayment"}
            </button>
          </fieldset>

          <Feedback state={state} />
        </form>
      )}
    </details>
  );
}

export default function EntryForms({
  tab,
  title,
  banks,
  advances,
  year,
  month,
  today,
}: Props) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  const [method, setMethod] = useState("CASH");
  const [employee, setEmployee] = useState("");
  const [employer, setEmployer] = useState("");
  const [payroll, setPayroll] = useState(emptyPayroll);
  const [payoutType, setPayoutType] = useState("Weekly");
  const [cutoff, setCutoff] = useState("Saturday to Friday");

  const [state, action, pending] = useActionState(
    saveEntry.bind(null, tab),
    INITIAL,
  );

  useEffect(() => {
    if (state.success) {
      form.current?.reset();
      setMethod("CASH");
      setEmployee("");
      setEmployer("");
      setPayroll(emptyPayroll());
      setPayoutType("Weekly");
      setCutoff("Saturday to Friday");
      router.refresh();
    }
  }, [state, router]);

  const isBenefit = tab === "benefits";
  const isAdvance = tab === "cash-advance";
  const isSalary = tab === "salaries";
  const isIncentive = tab === "incentives";

  const total =
    (Math.round(Number(employee || 0) * 100) +
      Math.round(Number(employer || 0) * 100)) / 100;

  const centavos = (field: string) => {
    const value = Number(payroll[field] || 0);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  };

  const grossCentavos =
    centavos("basic_salary") + centavos("total_allowance");

  const deductionsCentavos =
    centavos("sss_deduction") +
    centavos("pagibig_deduction") +
    centavos("philhealth_deduction") +
    centavos("hmo_deduction");

  const netCentavos = grossCentavos - deductionsCentavos;

  return (
    <>
      <details id="add-entry" className="apex-panel mt-6">
        <summary className="cursor-pointer text-xl font-semibold text-[#082451]">
          + Add {title.toLowerCase()} entry
        </summary>

        <form ref={form} action={action} className="mt-6">
          <fieldset
            disabled={pending}
            className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {isBenefit && (
              <div className="md:col-span-2 xl:col-span-3">
                <label className="font-medium">
                  Benefit type
                  <select
                    name="benefit_type"
                    required
                    className={control}
                  >
                    {["SSS", "PAG-IBIG", "PHILHEALTH", "HMO"].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            )}

            {isSalary && (
              <label className="font-medium">
                YEAR
                <select
                  name="year"
                  defaultValue={year}
                  required
                  className={control}
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
            )}

            <label className="font-medium">
              MONTH
              <select
                name="month"
                defaultValue={month || Number(today.slice(5, 7))}
                required
                className={control}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {!isSalary && (
              <label className="font-medium">
                YEAR
                <select
                  name="year"
                  defaultValue={year}
                  required
                  className={control}
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
            )}

            {isSalary && (
              <>
                <label className="font-medium">
                  CUT OFF PERIOD
                  <select
                    name="cut_off_period"
                    value={cutoff}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCutoff(value);
                      const match = PAYOUTS.find(
                        (item) => item.cutoff === value,
                      );
                      if (match) setPayoutType(match.type);
                    }}
                    required
                    className={control}
                  >
                    {PAYOUTS.map((item) => (
                      <option key={item.cutoff} value={item.cutoff}>
                        {item.cutoff}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="font-medium">
                  PAYOUT TYPE
                  <select
                    name="payout_type"
                    value={payoutType}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPayoutType(value);
                      const match = PAYOUTS.find(
                        (item) => item.type === value,
                      );
                      if (match) setCutoff(match.cutoff);
                    }}
                    required
                    className={control}
                  >
                    {PAYOUTS.map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.type}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="font-medium">
              {isBenefit || isSalary
                ? "EMPLOYEE NAME"
                : "EMPLOYEE / AGENT"}
              <input
                name="name"
                maxLength={200}
                required
                className={control}
              />
            </label>

            {isBenefit && (
              <>
                <div className="rounded-xl border border-[#e7d39c] bg-[#fff8e8] p-4">
                  <p className="text-base text-[#52647d]">
                    TOTAL CONTRIBUTION
                  </p>
                  <output
                    aria-live="polite"
                    className="mt-2 block text-2xl font-semibold"
                  >
                    {currency(Number.isFinite(total) ? total : 0)}
                  </output>
                </div>

                <label className="font-medium">
                  EMPLOYEE CONTRIBUTION
                  <input
                    name="employee_contribution"
                    type="number"
                    min="0"
                    step="0.01"
                    value={employee}
                    onChange={(event) =>
                      setEmployee(event.target.value)
                    }
                    required
                    className={control}
                  />
                </label>

                <label className="font-medium">
                  EMPLOYER CONTRIBUTION
                  <input
                    name="employer_contribution"
                    type="number"
                    min="0"
                    step="0.01"
                    value={employer}
                    onChange={(event) =>
                      setEmployer(event.target.value)
                    }
                    required
                    className={control}
                  />
                </label>
              </>
            )}

            {isSalary && (
              <>
                <label className="font-medium">
                  POSITION
                  <input
                    name="position"
                    maxLength={200}
                    required
                    className={control}
                  />
                </label>

                {PAYROLL_FIELDS.slice(0, 2).map(([field, label]) => (
                  <label key={field} className="font-medium">
                    {label}
                    <input
                      name={field}
                      type="number"
                      min="0"
                      step="0.01"
                      value={payroll[field]}
                      onChange={(event) =>
                        setPayroll((previous) => ({
                          ...previous,
                          [field]: event.target.value,
                        }))
                      }
                      required
                      className={control}
                    />
                  </label>
                ))}

                <div className="rounded-xl border border-[#e7d39c] bg-[#fff8e8] p-4">
                  <p className="text-base text-[#52647d]">
                    GROSS SALARY
                  </p>
                  <output
                    aria-live="polite"
                    className="mt-2 block text-2xl font-semibold"
                  >
                    {currency(grossCentavos / 100)}
                  </output>
                </div>

                {PAYROLL_FIELDS.slice(2).map(([field, label]) => (
                  <label key={field} className="font-medium">
                    {label}
                    <input
                      name={field}
                      type="number"
                      min="0"
                      step="0.01"
                      value={payroll[field]}
                      onChange={(event) =>
                        setPayroll((previous) => ({
                          ...previous,
                          [field]: event.target.value,
                        }))
                      }
                      required
                      className={control}
                    />
                  </label>
                ))}

                <div className="rounded-xl border border-[#e7d39c] bg-[#fff8e8] p-4">
                  <p className="text-base text-[#52647d]">
                    NET SALARY
                  </p>
                  <output
                    aria-live="polite"
                    className={`mt-2 block text-2xl font-semibold ${
                      netCentavos < 0 ? "text-[#b42318]" : ""
                    }`}
                  >
                    {currency(netCentavos / 100)}
                  </output>
                </div>
              </>
            )}

            {isIncentive && (
              <>
                <label className="font-medium">
                  INCENTIVE TYPE
                  <select
                    name="incentive_type"
                    required
                    className={control}
                  >
                    <option value="SALES INCENTIVE">
                      Sales incentive / commission
                    </option>
                    <option value="PERFORMANCE BONUS">
                      Performance bonus
                    </option>
                    <option value="ALLOWANCE">Allowance</option>
                    <option value="OTHER">Other</option>
                    <option value="PERFORMANCE INCENTIVE">
                      Performance incentive
                    </option>
                    <option value="OTHER INCENTIVE">
                      Other incentive
                    </option>
                  </select>
                </label>

                <label className="font-medium">
                  REFERENCE
                  <input
                    name="reference"
                    maxLength={500}
                    className={control}
                  />
                </label>
              </>
            )}

            {isAdvance && (
              <>
                <label className="font-medium">
                  PURPOSE
                  <input
                    name="purpose"
                    maxLength={500}
                    className={control}
                  />
                </label>

                <label className="font-medium">
                  ADVANCE DATE
                  <input
                    name="date"
                    type="date"
                    min="2026-01-01"
                    max={today}
                    defaultValue={today}
                    required
                    className={control}
                  />
                </label>
              </>
            )}

            {!isBenefit && !isSalary && (
              <label className="font-medium">
                AMOUNT
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className={control}
                />
              </label>
            )}

            {(isBenefit || isSalary) && (
              <label className="font-medium">
                {isBenefit ? "DATE" : "PAYMENT DATE"}
                <input
                  name="date"
                  type="date"
                  min="2026-01-01"
                  max={today}
                  defaultValue={today}
                  required
                  className={control}
                />
              </label>
            )}

            <label className="font-medium">
              MODE OF PAYMENT
              <select
                name="payment_method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                required
                className={control}
              >
                <option value="CASH">Cash</option>
                <option value="BANK TRANSFER">Bank transfer</option>
              </select>
            </label>

            <label className="font-medium">
              {isAdvance ? "DISBURSEMENT BANK" : "BANK NAME"}
              <select
                key={method}
                name="bank_id"
                required={method === "BANK TRANSFER"}
                disabled={method !== "BANK TRANSFER"}
                defaultValue=""
                className={control}
              >
                <option value="" disabled={method === "BANK TRANSFER"}>
                  {method === "BANK TRANSFER"
                    ? "Select bank"
                    : "Not applicable — Cash"}
                </option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>

            {isSalary && (
              <>
                <div className="rounded-xl border border-[#dce4ef] p-4">
                  <p className="text-base text-[#52647d]">
                    STATUS
                  </p>
                  <p className="mt-2 font-semibold text-emerald-800">
                    PAID
                  </p>
                  <p className="mt-2 text-base text-[#52647d]">
                    Saving records the net salary as paid on the selected date.
                  </p>
                </div>

                <label className="font-medium">
                  Description (optional)
                  <input
                    name="description"
                    maxLength={500}
                    placeholder="For example: October first payout"
                    className={control}
                  />
                </label>
              </>
            )}

            {isIncentive && (
              <>
                <label className="font-medium">
                  PAYMENT DATE
                  <input
                    name="date"
                    type="date"
                    min="2026-01-01"
                    max={today}
                    defaultValue={today}
                    required
                    className={control}
                  />
                </label>

                <label className="font-medium md:col-span-2">
                  NOTES
                  <textarea
                    name="notes"
                    maxLength={500}
                    rows={3}
                    className={control}
                  />
                </label>
              </>
            )}

            {isAdvance && (
              <label className="flex items-center gap-3 self-end rounded-xl border border-[#dce4ef] p-4">
                <input
                  name="is_declined"
                  type="checkbox"
                  className="size-5"
                />
                Record as declined
              </label>
            )}

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#f2b72f] px-6 py-3 font-semibold text-[#082451] disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save entry"}
              </button>
            </div>
          </fieldset>

          <Feedback state={state} />
        </form>
      </details>

      {isAdvance && (
        <RepaymentForm advances={advances} today={today} />
      )}
    </>
  );
}