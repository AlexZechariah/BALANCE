'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { compactMonthLabel, minorToMajor } from '@/lib/chart-data';
import { formatMoney, formatNumber } from '@/lib/format';

type SpendPoint = {
  month: string;
  amountMinor: number;
  count: number;
};

export function SpendBarChart({ data, height = 280 }: { data: SpendPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        No spend captured yet.
      </div>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    label: compactMonthLabel(item.month),
    amount: minorToMajor(item.amountMinor),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="currentColor"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatNumber(Number(value))}
        />
        <Tooltip
          cursor={{ fill: 'color-mix(in oklch, var(--primary) 10%, transparent)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as SpendPoint & { label: string };
            return (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                <p className="font-medium">{point.label}</p>
                <p className="mt-1 font-mono tabular-nums">{formatMoney(point.amountMinor)}</p>
                <p className="text-xs text-muted-foreground">{formatNumber(point.count)} document{point.count === 1 ? '' : 's'}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
