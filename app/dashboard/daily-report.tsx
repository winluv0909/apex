"use client";

import { useState } from "react";
import {
  generateDailyReport,
  generateFinancialReport,
  type DailyReport,
  type ReportPeriod,
  type ReportRequest,
} from "./report-actions";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function money(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

function periodTitle(period: ReportPeriod) {
  if (period === "monthly") return "Monthly";
  if (period === "annual") return "Annual";
  return "Daily";
}

function requestFromReport(report: DailyReport): ReportRequest {
  if (report.period === "daily") {
    return {
      period: "daily",
      date: report.date,
    };
  }

  return {
    period: report.period,
    year: Number(report.startDate.slice(0, 4)),
    month:
      report.period === "monthly"
        ? Number(report.startDate.slice(5, 7))
        : undefined,
  };
}

async function loadReport(request: ReportRequest) {
  if (request.period === "daily") {
    return generateDailyReport(request.date ?? "");
  }

  return generateFinancialReport(request);
}

export default function DailyReportPanel({
  today,
}: {
  today: string;
}) {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const [report, setReport] = useState<DailyReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "pdf" | null>(null);
  const [error, setError] = useState("");

  function clearPreview() {
    setReport(null);
    setError("");
  }

  async function preview() {
    setBusy("preview");
    setError("");
    setReport(null);

    const request: ReportRequest =
      period === "daily"
        ? { period, date }
        : {
            period,
            year,
            month: period === "monthly" ? month : undefined,
          };

    try {
      setReport(await loadReport(request));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not generate the report.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!report) return;

    setBusy("pdf");
    setError("");

    try {
      // Refresh the data and check owner authorization again.
      const fresh = await loadReport(requestFromReport(report));
      setReport(fresh);

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const title = periodTitle(fresh.period);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 23;

      const colors = {
        navy: [8, 36, 81] as [number, number, number],
        gold: [242, 183, 47] as [number, number, number],
        ink: [16, 36, 72] as [number, number, number],
        muted: [82, 100, 125] as [number, number, number],
        border: [220, 228, 239] as [number, number, number],
        pale: [245, 247, 251] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
        green: [22, 117, 91] as [number, number, number],
        red: [180, 35, 24] as [number, number, number],
      };

      const clean = (value: string) =>
        value.replace(/[\u0000-\u001f\u007f]/g, " ");

      const amount = (centavos: number) =>
        `PHP ${(centavos / 100).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

      const generated = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(fresh.generatedAt));

      const reportReference =
        `APEX-${fresh.period.toUpperCase()}-${fresh.startDate}`;

      pdf.setProperties({
        title: `APEX ${title} Financial Report - ${fresh.label}`,
        subject: `Financial activity from ${fresh.startDate} through ${fresh.throughDate}`,
        author: clean(fresh.preparedBy),
        creator: "APEX Business Dashboard",
        keywords: "APEX, financial report, cash flow, account activity",
      });

      // Convert the existing website logo to PNG for jsPDF.
      // If the image cannot load, the PDF still uses a text brand header.
      let logo: {
        data: string;
        width: number;
        height: number;
      } | null = null;

      try {
        const response = await fetch("/images/apex-logo-mark.png");

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          try {
            const source = await new Promise<HTMLImageElement>(
              (resolve, reject) => {
                const image = new window.Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(
                  new Error("Could not load the APEX logo."),
                );
                image.src = objectUrl;
              },
            );

            const canvas = document.createElement("canvas");
            canvas.width = source.naturalWidth;
            canvas.height = source.naturalHeight;

            const context = canvas.getContext("2d");

            if (
              context &&
              canvas.width > 0 &&
              canvas.height > 0
            ) {
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(source, 0, 0);

              logo = {
                data: canvas.toDataURL("image/png"),
                width: canvas.width,
                height: canvas.height,
              };
            }
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        }
      } catch {
        logo = null;
      }

      let y = 0;

      function setFont(
        size: number,
        bold = false,
        color = colors.ink,
      ) {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
      }

      function wrapped(
        text: string,
        width: number,
        size: number,
        bold = false,
      ) {
        setFont(size, bold);

        return pdf.splitTextToSize(
          clean(text),
          width,
        ) as string[];
      }

      function drawHeader(firstPage: boolean) {
        pdf.setFillColor(...colors.navy);
        pdf.rect(0, 0, pageWidth, 3, "F");

        pdf.setFillColor(...colors.gold);
        pdf.rect(0, 3, pageWidth, 1, "F");

        if (firstPage) {
          if (logo) {
            const scale = Math.min(
              60 / logo.width,
              20 / logo.height,
            );
            const logoWidth = logo.width * scale;
            const logoHeight = logo.height * scale;

            pdf.addImage(
              logo.data,
              "PNG",
              margin,
              11 + (20 - logoHeight) / 2,
              logoWidth,
              logoHeight,
            );
          } else {
            setFont(26, true, colors.navy);
            pdf.text("APEX", margin, 23);

            setFont(8, true, colors.muted);
            pdf.text("BUSINESS DASHBOARD", margin, 29);
          }

          setFont(8, true, colors.muted);
          pdf.text(
            "FINANCIAL REPORT",
            pageWidth - margin,
            16,
            { align: "right" },
          );

          setFont(9, true, colors.navy);
          pdf.text(
            reportReference,
            pageWidth - margin,
            22,
            { align: "right" },
          );

          setFont(8, false, colors.muted);
          pdf.text(
            "Asia/Manila",
            pageWidth - margin,
            28,
            { align: "right" },
          );

          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.3);
          pdf.line(margin, 36, pageWidth - margin, 36);

          y = 45;
        } else {
          setFont(12, true, colors.navy);
          pdf.text("APEX", margin, 16);

          setFont(8, false, colors.muted);
          pdf.text(
            clean(`${title} financial report | ${fresh.label}`),
            pageWidth - margin,
            16,
            { align: "right" },
          );

          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.3);
          pdf.line(margin, 21, pageWidth - margin, 21);

          y = 29;
        }
      }

      function newPage() {
        pdf.addPage();
        drawHeader(false);
      }

      function ensureSpace(height: number) {
        if (y + height > bottomLimit) {
          newPage();
        }
      }

      function paragraph(
        text: string,
        size = 9,
        color = colors.muted,
        width = contentWidth,
      ) {
        const lines = wrapped(text, width, size);
        const lineHeight = size * 0.3528 * 1.45;

        for (const part of lines) {
          ensureSpace(lineHeight + 2);
          setFont(size, false, color);
          pdf.text(part, margin, y);
          y += lineHeight;
        }

        y += 3;
      }

      function sectionHeading(
        heading: string,
        subtitle?: string,
        minimumBodyHeight = 14,
      ) {
        const subtitleLines = subtitle
          ? wrapped(subtitle, contentWidth - 5, 8)
          : [];
        const headingHeight = 10 + subtitleLines.length * 4;

        ensureSpace(headingHeight + minimumBodyHeight);

        pdf.setFillColor(...colors.gold);
        pdf.rect(margin, y - 4, 1.5, 6, "F");

        setFont(11, true, colors.navy);
        pdf.text(clean(heading), margin + 5, y);

        y += 6;

        if (subtitleLines.length) {
          setFont(8, false, colors.muted);
          pdf.text(subtitleLines, margin + 5, y);
          y += subtitleLines.length * 4 + 2;
        }

        y += 3;
      }

      type Column = {
        label: string;
        width: number;
        align?: "left" | "right";
      };

      type TableRow = {
        cells: string[];
        total?: boolean;
        direction?: "in" | "out";
      };

      function drawTable(
        columns: Column[],
        rows: TableRow[],
        emptyMessage: string,
      ) {
        const headerHeight = 10;
        const fontSize = 8;
        const lineHeight = 4;
        const cellPadding = 3;

        function tableHeader() {
          ensureSpace(headerHeight + 14);

          pdf.setFillColor(...colors.navy);
          pdf.rect(
            margin,
            y,
            contentWidth,
            headerHeight,
            "F",
          );

          let x = margin;

          for (const column of columns) {
            setFont(7.5, true, colors.white);

            pdf.text(
              column.label,
              column.align === "right"
                ? x + column.width - cellPadding
                : x + cellPadding,
              y + 6.3,
              { align: column.align ?? "left" },
            );

            x += column.width;
          }

          y += headerHeight;
        }

        tableHeader();

        if (!rows.length) {
          const lines = wrapped(
            emptyMessage,
            contentWidth - cellPadding * 2,
            fontSize,
          );
          const height = Math.max(
            14,
            lines.length * lineHeight + 6,
          );

          ensureSpace(height);

          pdf.setFillColor(...colors.pale);
          pdf.rect(margin, y, contentWidth, height, "F");

          setFont(fontSize, false, colors.muted);
          pdf.text(
            lines,
            margin + cellPadding,
            y + 6,
          );

          y += height + 8;
          return;
        }

        for (let index = 0; index < rows.length; index++) {
          const row = rows[index];

          const cellLines = columns.map((column, columnIndex) =>
            wrapped(
              row.cells[columnIndex] ?? "",
              column.width - cellPadding * 2,
              fontSize,
              Boolean(row.total),
            ),
          );

          const maximumLines = Math.max(
            1,
            ...cellLines.map((lines) => lines.length),
          );
          const fullHeight = Math.max(
            14,
            maximumLines * lineHeight + 6,
          );

          // Move a normal row to the next page instead of splitting it.
          if (y + fullHeight > bottomLimit) {
            newPage();
            tableHeader();
          }

          let lineOffset = 0;

          // Extremely long descriptions can continue on another page,
          // with the table header repeated and amounts printed only once.
          while (lineOffset < maximumLines) {
            const availableLines = Math.floor(
              (bottomLimit - y - 6) / lineHeight,
            );

            if (availableLines < 2) {
              newPage();
              tableHeader();
              continue;
            }

            const linesOnPage = Math.min(
              maximumLines - lineOffset,
              availableLines,
            );
            const rowHeight = Math.max(
              14,
              linesOnPage * lineHeight + 6,
            );

            if (row.total) {
              pdf.setFillColor(237, 242, 249);
            } else if (index % 2 === 0) {
              pdf.setFillColor(...colors.pale);
            } else {
              pdf.setFillColor(...colors.white);
            }

            pdf.rect(
              margin,
              y,
              contentWidth,
              rowHeight,
              "F",
            );

            let x = margin;

            for (
              let columnIndex = 0;
              columnIndex < columns.length;
              columnIndex++
            ) {
              const column = columns[columnIndex];
              const parts = cellLines[columnIndex].slice(
                lineOffset,
                lineOffset + linesOnPage,
              );

              const color =
                column.align === "right" && row.direction
                  ? row.direction === "in"
                    ? colors.green
                    : colors.red
                  : row.total
                    ? colors.navy
                    : colors.ink;

              setFont(
                fontSize,
                Boolean(row.total) || column.align === "right",
                color,
              );

              if (parts.length) {
                pdf.text(
                  parts,
                  column.align === "right"
                    ? x + column.width - cellPadding
                    : x + cellPadding,
                  y + 6,
                  {
                    align: column.align ?? "left",
                    lineHeightFactor: lineHeight / (fontSize * 0.3528),
                  },
                );
              }

              x += column.width;
            }

            pdf.setDrawColor(...colors.border);
            pdf.setLineWidth(0.2);
            pdf.line(
              margin,
              y + rowHeight,
              pageWidth - margin,
              y + rowHeight,
            );

            y += rowHeight;
            lineOffset += linesOnPage;

            if (lineOffset < maximumLines) {
              newPage();
              tableHeader();
            }
          }
        }

        y += 8;
      }

      drawHeader(true);

      setFont(8, true, colors.muted);
      pdf.text(
        `${title.toUpperCase()} FINANCIAL REPORT`,
        margin,
        y,
      );

      y += 10;

      setFont(23, true, colors.navy);
      const titleLines = wrapped(fresh.label, contentWidth, 23, true);
      pdf.text(titleLines, margin, y);
      y += titleLines.length * 9 + 4;

      paragraph(
        `Selected range: ${fresh.startDate} to ${fresh.endDate}`,
        9,
      );

      // Metadata panel expands to accommodate long owner names.
      const metadataWidth = (contentWidth - 16) / 2;

      const leftMetadata = [
        ["PREPARED BY", fresh.preparedBy],
        ["GENERATED", generated],
      ];

      const rightMetadata = [
        ["ACTIVITY INCLUDED THROUGH", fresh.throughDate],
        [
          "REPORT STATUS",
          fresh.provisional
            ? "Current period - activity recorded so far"
            : `Historical ${title.toLowerCase()} report`,
        ],
      ];

      function metadataHeight(items: string[][]) {
        return items.reduce(
          (height, [, value]) =>
            height +
            5 +
            wrapped(value, metadataWidth, 8.5).length * 4 +
            4,
          0,
        );
      }

      const panelHeight =
        Math.max(
          metadataHeight(leftMetadata),
          metadataHeight(rightMetadata),
        ) + 9;

      ensureSpace(panelHeight + 8);

      pdf.setFillColor(...colors.pale);
      pdf.setDrawColor(...colors.border);
      pdf.roundedRect(
        margin,
        y,
        contentWidth,
        panelHeight,
        2,
        2,
        "FD",
      );

      function metadataColumn(
        items: string[][],
        x: number,
      ) {
        let itemY = y + 7;

        for (const [label, value] of items) {
          setFont(7, true, colors.muted);
          pdf.text(label, x, itemY);

          itemY += 5;

          const lines = wrapped(value, metadataWidth, 8.5);
          setFont(8.5, false, colors.ink);
          pdf.text(lines, x, itemY, {
            lineHeightFactor: 4 / (8.5 * 0.3528),
          });

          itemY += lines.length * 4 + 4;
        }
      }

      metadataColumn(leftMetadata, margin + 5);
      metadataColumn(
        rightMetadata,
        margin + contentWidth / 2 + 3,
      );

      y += panelHeight + 11;

      sectionHeading(`${title} summary`, undefined, 38);

      const cardGap = 4;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      const cardHeight = 30;

      const summaryCards = [
        {
          label: "MONEY RECEIVED",
          value: fresh.incoming,
          dark: false,
        },
        {
          label: "MONEY PAID OUT",
          value: fresh.outgoing,
          dark: false,
        },
        {
          label: "NET CASH MOVEMENT",
          value: fresh.net,
          dark: true,
        },
      ];

      ensureSpace(cardHeight + 8);

      summaryCards.forEach((card, index) => {
        const x = margin + index * (cardWidth + cardGap);

        pdf.setFillColor(
          ...(card.dark ? colors.navy : colors.pale),
        );
        pdf.setDrawColor(
          ...(card.dark ? colors.navy : colors.border),
        );

        pdf.roundedRect(
          x,
          y,
          cardWidth,
          cardHeight,
          2,
          2,
          "FD",
        );

        pdf.setFillColor(...colors.gold);
        pdf.rect(x + 5, y + 5, 9, 1, "F");

        setFont(
          7,
          true,
          card.dark ? colors.white : colors.muted,
        );
        pdf.text(card.label, x + 5, y + 12);

        const valueText = amount(card.value);
        let valueSize = 13;

        setFont(
          valueSize,
          true,
          card.dark ? colors.white : colors.navy,
        );

        while (
          pdf.getTextWidth(valueText) > cardWidth - 10 &&
          valueSize > 7
        ) {
          valueSize -= 0.5;
          setFont(
            valueSize,
            true,
            card.dark ? colors.white : colors.navy,
          );
        }

        pdf.text(valueText, x + 5, y + 23);
      });

      y += cardHeight + 11;

      sectionHeading(
        "Account activity",
        "Net movement for the selected period. Opening balances are not included.",
        24,
      );

      const accountRows: TableRow[] = fresh.accounts.map(
        (account) => ({
          cells: [
            account.name,
            amount(account.incoming),
            amount(account.outgoing),
            amount(account.net),
          ],
        }),
      );

      if (fresh.accounts.length) {
        accountRows.push({
          total: true,
          cells: [
            "TOTAL",
            amount(fresh.incoming),
            amount(fresh.outgoing),
            amount(fresh.net),
          ],
        });
      }

      drawTable(
        [
          { label: "ACCOUNT", width: 50 },
          { label: "RECEIVED", width: 44, align: "right" },
          { label: "PAID OUT", width: 44, align: "right" },
          {
            label: "NET MOVEMENT",
            width: contentWidth - 138,
            align: "right",
          },
        ],
        accountRows,
        "No account activity recorded for this period.",
      );

      sectionHeading(
        `Transactions (${fresh.transactions.length})`,
        "Amounts are shown in PHP. Full transaction references are retained below each description.",
        24,
      );

      drawTable(
        [
          { label: "DATE", width: 22 },
          { label: "TRANSACTION / REFERENCE", width: 67 },
          { label: "ACCOUNT", width: 35 },
          { label: "RECEIVED", width: 29, align: "right" },
          {
            label: "PAID OUT",
            width: contentWidth - 153,
            align: "right",
          },
        ],
        fresh.transactions.map((transaction) => ({
          direction: transaction.direction,
          cells: [
            transaction.date,
            [
              transaction.category,
              transaction.description,
              `Reference: ${transaction.reference}`,
            ].join(" | "),
            transaction.account,
            transaction.direction === "in"
              ? amount(transaction.centavos)
              : "-",
            transaction.direction === "out"
              ? amount(transaction.centavos)
              : "-",
          ],
        })),
        "No dated transactions recorded for this period.",
      );

      sectionHeading("Report basis", undefined, 20);

      paragraph(
        "Includes transactions whose payment, expense or issue date falls within the selected range, up to today in Manila. Undated entries are excluded. Declined cash advances and their repayments are excluded. Cash advance repayments are received by BDO.",
        8.5,
      );

      paragraph(
        "Net cash movement is money received minus money paid out for the included period. It is not an opening or closing account balance. Historical reports reflect currently stored records.",
        8.5,
      );

      const count = pdf.getNumberOfPages();

      for (let page = 1; page <= count; page++) {
        pdf.setPage(page);

        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.line(
          margin,
          pageHeight - 17,
          pageWidth - margin,
          pageHeight - 17,
        );

        setFont(7.5, true, colors.navy);
        pdf.text(
          "APEX | BUSINESS DASHBOARD",
          margin,
          pageHeight - 12,
        );

        setFont(7, false, colors.muted);
        pdf.text(
          "Private business financial report",
          margin,
          pageHeight - 7,
        );

        pdf.text(
          `Page ${page} of ${count}`,
          pageWidth - margin,
          pageHeight - 12,
          { align: "right" },
        );

        pdf.text(
          clean(`${title} report | ${fresh.label}`),
          pageWidth - margin,
          pageHeight - 7,
          { align: "right" },
        );
      }

      const filePeriod =
        fresh.period === "daily"
          ? fresh.date
          : fresh.period === "monthly"
            ? fresh.startDate.slice(0, 7)
            : fresh.startDate.slice(0, 4);

      pdf.save(`APEX-${title}-Report-${filePeriod}.pdf`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not download the PDF.",
      );
    } finally {
      setBusy(null);
    }
  }

  const buttonClass =
    "rounded-xl px-5 py-3 text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  const controlClass =
    "mt-2 block rounded-xl border border-[#dce4ef] bg-[#f8fafd] px-4 py-3 text-lg text-[#082451]";

  return (
    <section
      aria-labelledby="daily-report-heading"
      className="mt-8 overflow-hidden rounded-2xl border border-[#dce4ef] bg-white/95 shadow-sm"
    >
      <div className="border-b border-[#dce4ef] bg-[#082451] p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-[#f2b72f]">
          Owner reports
        </p>

        <h2
          id="daily-report-heading"
          className="mt-2 text-2xl font-semibold"
        >
          Financial reports
        </h2>

        <p className="mt-2 text-lg leading-7 text-white/85">
          Generate a daily, monthly, or annual report and download
          it as a PDF.
        </p>
      </div>

      <div className="p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <label className="text-base font-semibold text-[#52647d]">
            Report type
            <select
              value={period}
              disabled={busy !== null}
              onChange={(event) => {
                setPeriod(event.target.value as ReportPeriod);
                clearPreview();
              }}
              className={controlClass}
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>

          {period === "daily" && (
            <label className="text-base font-semibold text-[#52647d]">
              Report date · Manila
              <input
                type="date"
                required
                max={today}
                value={date}
                disabled={busy !== null}
                onChange={(event) => {
                  setDate(event.target.value);
                  clearPreview();
                }}
                className={controlClass}
              />
            </label>
          )}

          {period !== "daily" && (
            <label className="text-base font-semibold text-[#52647d]">
              Year
              <select
                value={year}
                disabled={busy !== null}
                onChange={(event) => {
                  const selectedYear = Number(event.target.value);
                  setYear(selectedYear);

                  if (
                    selectedYear === currentYear &&
                    month > currentMonth
                  ) {
                    setMonth(currentMonth);
                  }

                  clearPreview();
                }}
                className={controlClass}
              >
                {Array.from(
                  { length: Math.max(0, currentYear - 2026 + 1) },
                  (_, index) => 2026 + index,
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          )}

          {period === "monthly" && (
            <label className="text-base font-semibold text-[#52647d]">
              Month
              <select
                value={month}
                disabled={busy !== null}
                onChange={(event) => {
                  setMonth(Number(event.target.value));
                  clearPreview();
                }}
                className={controlClass}
              >
                {MONTHS.map((name, index) => (
                  <option
                    key={name}
                    value={index + 1}
                    disabled={
                      year === currentYear &&
                      index + 1 > currentMonth
                    }
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="submit"
            disabled={
              busy !== null ||
              (period === "daily" && !date)
            }
            className={`${buttonClass} bg-[#f2b72f] text-[#082451] hover:bg-[#e5a71c]`}
          >
            {busy === "preview" ? "Generating…" : "Generate report"}
          </button>

          {report && (
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy !== null}
              className={`${buttonClass} bg-[#082451] text-white hover:bg-[#153762]`}
            >
              {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
            </button>
          )}
        </form>

        {error && (
          <p role="alert" className="mt-4 text-lg text-[#b42318]">
            {error}
          </p>
        )}

        {report && (
          <div className="mt-6" aria-live="polite">
            <h3 className="text-xl font-semibold text-[#082451]">
              {periodTitle(report.period)} report for {report.label}
            </h3>

            <p className="mt-2 text-base text-[#52647d]">
              {report.provisional
                ? `This period is still in progress. Activity is included from ${report.startDate} through ${report.throughDate}.`
                : `Based on the currently stored records from ${report.startDate} through ${report.endDate}.`}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ["Money received", report.incoming],
                ["Money paid out", report.outgoing],
                ["Net cash movement", report.net],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="min-w-0 rounded-xl border border-[#dce4ef] bg-[#f8fafd] p-5"
                >
                  <p className="text-lg text-[#52647d]">
                    {label}
                  </p>

                  <p className="mt-3 wrap-break-word text-3xl font-semibold text-[#082451] tabular-nums">
                    {money(Number(value))}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-base">
                <caption className="pb-3 text-left text-lg font-semibold">
                  Cash and bank activity
                </caption>

                <thead className="bg-[#edf2f9] text-[#082451]">
                  <tr>
                    <th scope="col" className="p-3">
                      Account
                    </th>
                    <th scope="col" className="p-3">
                      Received
                    </th>
                    <th scope="col" className="p-3">
                      Paid out
                    </th>
                    <th scope="col" className="p-3">
                      Net movement
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {report.accounts.map((account) => (
                    <tr
                      key={account.name}
                      className="border-b border-[#dce4ef]"
                    >
                      <th scope="row" className="p-3 font-medium">
                        {account.name}
                      </th>

                      <td className="whitespace-nowrap p-3">
                        {money(account.incoming)}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {money(account.outgoing)}
                      </td>

                      <td className="whitespace-nowrap p-3 font-semibold">
                        {money(account.net)}
                      </td>
                    </tr>
                  ))}

                  {!report.accounts.length && (
                    <tr>
                      <td colSpan={4} className="p-4 text-[#52647d]">
                        No dated transactions for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <details className="mt-5 rounded-xl border border-[#dce4ef] p-4">
              <summary className="cursor-pointer text-lg font-semibold">
                View transactions ({report.transactions.length})
              </summary>

              <ul className="mt-4 space-y-3">
                {report.transactions.map((transaction) => (
                  <li
                    key={`${transaction.category}-${transaction.reference}`}
                    className="flex flex-wrap justify-between gap-3 border-t border-[#dce4ef] pt-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {transaction.category}
                      </p>

                      <p className="mt-1 text-[#52647d]">
                        {transaction.date}
                      </p>

                      <p className="mt-1 break-all text-[#52647d]">
                        {transaction.description}
                      </p>

                      <p className="mt-1 text-[#52647d]">
                        {transaction.account}
                      </p>
                    </div>

                    <p className="font-semibold tabular-nums">
                      {transaction.direction === "in" ? "+" : "−"}
                      {money(transaction.centavos)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>

            <p className="mt-5 text-base leading-7 text-[#52647d]">
              Only dated transactions are included. Net movement
              shows the selected period’s receipts minus
              disbursements, not the account’s closing balance.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}