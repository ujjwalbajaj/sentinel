"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUsd } from "@/lib/utils";

export function TrendChart({
  data,
  dataKey,
  color,
  name,
  currency = false,
}: {
  data: { day: string; score?: number; tvl?: number }[];
  dataKey: "score" | "tvl";
  color: string;
  name: string;
  currency?: boolean;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="day" stroke="#97A1B0" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#97A1B0"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={currency ? 56 : 32}
            tickFormatter={(value) => (currency ? formatUsd(Number(value)) : String(value))}
          />
          <Tooltip
            contentStyle={{ background: "#12161D", border: "1px solid #232A35", borderRadius: 10, color: "#E6E9EF" }}
            formatter={(value) => [currency ? formatUsd(Number(value)) : value, name]}
          />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
