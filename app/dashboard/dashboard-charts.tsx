"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardData } from "./dashboard-data";

const COLORS = [
  "#082451", "#e9ad25", "#3564a0", "#168578",
  "#8763a8", "#c96d38", "#798ba5", "#b43d68",
];

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

function short(value: number) {
  return new Intl.NumberFormat("en-PH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function Ranking({
  title,
  entries,
  color,
}: {
  title: string;
  entries: { name: string; amount: number }[];
  color: string;
}) {
  const data = entries.map((entry) => ({
    name: entry.name,
    amount: entry.amount / 100,
  }));

  return (
    <section className="apex-panel">
      <h2 className="apex-section-title">{title}</h2>

      {!data.length ? (
        <p className="py-12 text-center text-[#52647d]">
          No sales recorded for this year.
        </p>
      ) : (
        <>
          <div className="mt-5 h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                accessibilityLayer
              >
                <CartesianGrid
                  stroke="#e4eaf2"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickFormatter={short}
                  tick={{ fontSize: 13 }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={125}
                  tick={{ fontSize: 13 }}
                  tickFormatter={(value) =>
                    String(value).length > 17
                      ? `${String(value).slice(0, 17)}…`
                      : String(value)
                  }
                />
                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                />
                <Bar
                  dataKey="amount"
                  name="Total sales"
                  fill={color}
                  radius={[0, 5, 5, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="apex-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Total sales</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.name}>
                    <th scope="row">{entry.name}</th>
                    <td>{money(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function DashboardCharts({
  data,
  year,
}: {
  data: DashboardData;
  year: number;
}) {
  const monthly = data.monthly.map((entry) => ({
    month: entry.month,
    sales: entry.sales / 100,
    collections: entry.collections / 100,
    outflows: entry.outflows / 100,
    net: entry.net / 100,
  }));

  const agentData = monthly.map((entry, index) => ({
    month: entry.month,
    ...Object.fromEntries(
      data.agentSeries.map((agent) => [
        agent.key,
        agent.values[index] / 100,
      ]),
    ),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="apex-panel">
          <h2 className="apex-section-title">
            Cash flow by month · {year}
          </h2>
          <p className="apex-description">
            Collections, disbursements, and net movement.
          </p>

          <div className="mt-6 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthly}
                margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
                accessibilityLayer
              >
                <CartesianGrid stroke="#e4eaf2" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#798ba5" />
                <Line
                  type="linear"
                  dataKey="collections"
                  name="Collections"
                  stroke="#168578"
                  strokeWidth={3}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="outflows"
                  name="Disbursements"
                  stroke="#e9ad25"
                  strokeWidth={3}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="net"
                  name="Net movement"
                  stroke="#082451"
                  strokeWidth={3}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="apex-panel">
          <h2 className="apex-section-title">
            Sales by month · {year}
          </h2>
          <p className="apex-description">
            Gross sales, including separate manual agent inputs.
          </p>

          <div className="mt-6 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly}
                margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
                accessibilityLayer
              >
                <CartesianGrid
                  stroke="#e4eaf2"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                />
                <Bar
                  dataKey="sales"
                  name="Total sales"
                  fill="#082451"
                  radius={[5, 5, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Ranking
          title={`Top 5 customers · ${year}`}
          entries={data.topCustomers}
          color="#082451"
        />
        <Ranking
          title={`Top 5 agents · ${year}`}
          entries={data.topAgents}
          color="#b98208"
        />
      </div>

      <section className="apex-panel">
        <h2 className="apex-section-title">
          Monthly sales by agent · {year}
        </h2>
        <p className="apex-description">
          Sales records plus separate manual agent inputs.
        </p>

        {!data.agentSeries.length ? (
          <p className="py-12 text-center text-[#52647d]">
            No agent sales recorded for this year.
          </p>
        ) : (
          <>
            <div className="mt-6 h-120 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={agentData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    stroke="#e4eaf2"
                    horizontal={false}
                  />
                  <XAxis type="number" tickFormatter={short} />
                  <YAxis type="category" dataKey="month" width={50} />
                  <Tooltip
                    formatter={(value) => money(Number(value ?? 0))}
                  />
                  {data.agentSeries.map((agent, index) => (
                    <Bar
                      key={agent.key}
                      dataKey={agent.key}
                      name={agent.name}
                      stackId="agents"
                      fill={COLORS[index % COLORS.length]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {data.agentSeries.map((agent, index) => (
                <span
                  key={agent.key}
                  className="flex items-center gap-2 text-base"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-sm"
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                  {agent.name}
                </span>
              ))}
            </div>

            <details className="mt-5">
              <summary className="cursor-pointer font-semibold">
                View monthly agent figures
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="apex-table">
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      {monthly.map((entry) => (
                        <th scope="col" key={entry.month}>
                          {entry.month}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentSeries.map((agent) => (
                      <tr key={agent.key}>
                        <th scope="row">{agent.name}</th>
                        {agent.values.map((value, index) => (
                          <td key={index}>{money(value / 100)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}