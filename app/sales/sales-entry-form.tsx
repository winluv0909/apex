"use client";

import { useActionState, useState } from "react";
import { saveSale, type SaleState } from "./actions";

type Bank = {
  id: string;
  name: string;
};

type Props = {
  saleType: string;
  banks: Bank[];
  today: string;
};

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const INSTALLMENT_MONTHS = [3, 6, 9, 12, 18, 24, 36, 48, 60];

const initialState: SaleState = { error: "" };

const controlClass = "apex-control mt-2 block w-full";

function toCentavos(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function pesos(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

function CalculatedField({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[#e9d59d] bg-[#fff8e7] p-4">
      <p className="text-sm font-bold tracking-wide text-[#73540c]">
        {label}
      </p>

      <output
        aria-live="polite"
        className="mt-2 block text-2xl font-semibold text-[#082451]"
      >
        {pesos(value)}
      </output>
    </div>
  );
}

export default function SalesEntryForm({
  saleType,
  banks,
  today,
}: Props) {
  const [state, formAction, pending] = useActionState(
    saveSale,
    initialState,
  );

  const [baseAmount, setBaseAmount] = useState("");
  const [withholdingRate, setWithholdingRate] = useState("1");
  const [downPayment, setDownPayment] = useState("");
  const [fullPayment, setFullPayment] = useState("");

  const [downPaymentMethod, setDownPaymentMethod] = useState("CASH");
  const [fullPaymentMethod, setFullPaymentMethod] = useState("CASH");

  const isNonVatable = saleType === "non_vatable";
  const hasWithholding = saleType === "vatable_with_withholding";

  const baseCentavos = toCentavos(baseAmount);

  const vatCentavos = isNonVatable
    ? 0
    : Math.round(baseCentavos * 0.12);

  const priceWithVatCentavos = baseCentavos + vatCentavos;

  const parsedRate = Number(withholdingRate);

  const withholdingCentavos =
    hasWithholding && Number.isFinite(parsedRate)
      ? Math.round((baseCentavos * parsedRate) / 100)
      : 0;

  const payableCentavos =
    priceWithVatCentavos - withholdingCentavos;

  const downPaymentCentavos = toCentavos(downPayment);
  const fullPaymentCentavos = toCentavos(fullPayment);

  const balanceCentavos = Math.max(
    0,
    payableCentavos - downPaymentCentavos,
  );

  const collectionCentavos = Math.max(
    0,
    payableCentavos -
      downPaymentCentavos -
      fullPaymentCentavos,
  );

  const exceedsBalance =
    downPaymentCentavos + fullPaymentCentavos > payableCentavos;

  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  return (
    <section
      id="add-entry"
      className="apex-panel mb-8 scroll-mt-[calc(var(--apex-header-height,112px)+20px)]"
    >
      <div className="mb-6">
        <h2 className="apex-section-title">Add a sale</h2>

        <p className="mt-2 text-base text-[#52647d]">
          Enter the sale details below. VAT, withholding tax, balance,
          and the amount for collection are calculated automatically.
        </p>
      </div>

      <form
        action={formAction}
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        <input type="hidden" name="sale_type" value={saleType} />

        <label className="font-semibold">
          MONTH OF
          <select
            name="sale_month"
            defaultValue={currentMonth}
            required
            className={controlClass}
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
            name="sale_year"
            defaultValue={currentYear}
            required
            className={controlClass}
          >
            {Array.from(
              { length: 2100 - 2026 + 1 },
              (_, index) => 2026 + index,
            ).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="font-semibold">
          AGENT NAME
          <input
            name="agent_name"
            type="text"
            maxLength={500}
            required
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          CLIENT NAME
          <input
            name="customer_name"
            type="text"
            maxLength={500}
            required
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          COMPANY NAME
          <input
            name="company_name"
            type="text"
            maxLength={500}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          TIN NO.
          <input
            name="tin_no"
            type="text"
            maxLength={500}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          COMPANY ADDRESS
          <input
            name="company_address"
            type="text"
            maxLength={500}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          {isNonVatable ? "SALES AMOUNT" : "SALES AMOUNT W/O VAT"}
          <input
            name="base_amount"
            type="number"
            min="0.01"
            step="0.01"
            value={baseAmount}
            onChange={(event) => setBaseAmount(event.target.value)}
            required
            className={controlClass}
          />
        </label>

        {!isNonVatable && (
          <>
            <CalculatedField
              label="VAT PRICE"
              value={vatCentavos}
            />

            <CalculatedField
              label="PRICE WITH VAT"
              value={priceWithVatCentavos}
            />
          </>
        )}

        {hasWithholding && (
          <>
            <CalculatedField
              label="WITHHELD TAX"
              value={withholdingCentavos}
            />

            <label className="font-semibold">
              WTH
              <div className="relative">
                <input
                  name="withholding_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.0001"
                  value={withholdingRate}
                  onChange={(event) =>
                    setWithholdingRate(event.target.value)
                  }
                  required
                  className={`${controlClass} pr-12`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#52647d]">
                  %
                </span>
              </div>
            </label>

            <CalculatedField
              label="AMOUNT LESS WITHHELD"
              value={payableCentavos}
            />
          </>
        )}

        <label className="font-semibold">
          DOWN PAYMENT
          <input
            name="down_payment_amount"
            type="number"
            min="0"
            max={Math.max(0, payableCentavos) / 100}
            step="0.01"
            value={downPayment}
            onChange={(event) => setDownPayment(event.target.value)}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          DATE OF DP
          <input
            name="down_payment_date"
            type="date"
            min="2026-01-01"
            max={today}
            required={downPaymentCentavos > 0}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          MODE OF PAYMENT
          <select
            name="down_payment_method"
            value={downPaymentMethod}
            onChange={(event) =>
              setDownPaymentMethod(event.target.value)
            }
            className={controlClass}
          >
            <option value="CASH">Cash</option>
            <option value="BANK TRANSFER">Bank Transfer</option>

            {INSTALLMENT_MONTHS.map((months) => (
              <option
                key={months}
                value={`INSTALLMENT TERM - ${months} MONTHS`}
              >
                Installment term - {months} months
              </option>
            ))}
          </select>
        </label>

        <label className="font-semibold">
          BANK NAME
          <select
            key={`down-payment-bank-${downPaymentMethod}`}
            name="down_payment_bank_id"
            defaultValue=""
            disabled={downPaymentMethod !== "BANK TRANSFER"}
            required={
              downPaymentMethod === "BANK TRANSFER" &&
              downPaymentCentavos > 0
            }
            className={controlClass}
          >
            <option value="">
              {downPaymentMethod === "BANK TRANSFER"
                ? "Select bank"
                : "Not applicable"}
            </option>

            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>

        <CalculatedField
          label="BALANCE"
          value={balanceCentavos}
        />

        <label className="font-semibold">
          FULL PAYMENT
          <input
            name="final_payment_amount"
            type="number"
            min="0"
            max={balanceCentavos / 100}
            step="0.01"
            value={fullPayment}
            onChange={(event) => setFullPayment(event.target.value)}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          DATE OF FP
          <input
            name="final_payment_date"
            type="date"
            min="2026-01-01"
            max={today}
            required={fullPaymentCentavos > 0}
            className={controlClass}
          />
        </label>

        <label className="font-semibold">
          MODE OF PAYMENT
          <select
            name="final_payment_method"
            value={fullPaymentMethod}
            onChange={(event) =>
              setFullPaymentMethod(event.target.value)
            }
            className={controlClass}
          >
            <option value="CASH">Cash</option>
            <option value="BANK TRANSFER">Bank Transfer</option>

            {INSTALLMENT_MONTHS.map((months) => (
              <option
                key={months}
                value={`INSTALLMENT TERM - ${months} MONTHS`}
              >
                Installment term - {months} months
              </option>
            ))}
          </select>
        </label>

        <label className="font-semibold">
          BANK NAME
          <select
            key={`full-payment-bank-${fullPaymentMethod}`}
            name="final_payment_bank_id"
            defaultValue=""
            disabled={fullPaymentMethod !== "BANK TRANSFER"}
            required={
              fullPaymentMethod === "BANK TRANSFER" &&
              fullPaymentCentavos > 0
            }
            className={controlClass}
          >
            <option value="">
              {fullPaymentMethod === "BANK TRANSFER"
                ? "Select bank"
                : "Not applicable"}
            </option>

            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>

        <CalculatedField
          label="FOR COLLECTION"
          value={collectionCentavos}
        />

        {exceedsBalance && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-base font-semibold text-red-700 md:col-span-2 xl:col-span-3"
          >
            Down payment and full payment combined exceed the sale
            amount after withholding tax.
          </p>
        )}

        {state.error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-base font-semibold text-red-700 md:col-span-2 xl:col-span-3"
          >
            {state.error}
          </p>
        )}

        <div className="border-t border-[#dce4ef] pt-5 md:col-span-2 xl:col-span-3">
          <button
            type="submit"
            disabled={pending || exceedsBalance}
            className="rounded-xl bg-[#f2b72f] px-7 py-3 font-bold text-[#082451] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save sale"}
          </button>

          <p className="mt-3 text-base text-[#52647d]">
            The sale and initial payments are saved together.
            Choose Cash or Bank Transfer for payments received.
            Installment schedules still need to be connected.
          </p>
        </div>
      </form>
    </section>
  );
}