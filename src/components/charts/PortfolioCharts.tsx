'use client'

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { MonthlyBalance } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

// Recharts takes raw color strings on props (stroke, fill, tick.fill etc.) and
// can't use Tailwind classes. Reading the CSS variables via rgb() keeps the
// charts in sync with the active theme — toggling light/dark re-paints them
// on next render without any hex code changes.
const TOKEN = (name: string) => `rgb(var(--${name}))`

// Theme-aware chrome colors
const CHROME = {
  grid:       TOKEN('c-border'),
  axisStrong: TOKEN('c-border-strong'),
  text:       TOKEN('c-fg-dim'),
  accent:     TOKEN('c-accent'),
  success:    TOKEN('c-success-light'),
}

// Series colors stay constant across themes — they're visual identifiers, not
// theme tokens. Vibrant enough to read on either background.
const COLORS = {
  sfr:           '#58A6FF',
  mfr:           '#D4A853',
  raw_land:      '#8B949E',
  and:           '#3FB950',
  finished_lots: '#A371F7',
  hhh:           '#F85149',
  land_bucket:   '#79C0FF',
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg p-3 shadow-xl text-xs">
      <div className="text-fg-strong font-medium mb-2">{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-fg-dim">{entry.name}</span>
          </div>
          <span className="font-mono text-fg">{formatCurrency(entry.value, true)}</span>
        </div>
      ))}
    </div>
  )
}

interface ChartProps { data: MonthlyBalance[] }

// Stacked area chart for the Land Bucket projection. Each project becomes
// one stacked series so callers see both the aggregate trajectory and the
// per-project contribution. Recharts needs string data keys, so project
// names are passed alongside their resolved colors.
interface LandBucketProjectionChartProps {
  data: Array<Record<string, number | string>>
  projects: { name: string; color: string }[]
}

export function LandBucketProjectionChart({ data, projects }: LandBucketProjectionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false}
               tickFormatter={v => formatCurrency(v, true)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        {projects.map(p => (
          <Area key={p.name} type="monotone" dataKey={p.name}
                stackId="lb" stroke={p.color} fill={p.color}
                fillOpacity={0.35} strokeWidth={1.5} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function TotalBalanceChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHROME.accent} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHROME.accent} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="azureGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#58A6FF" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#58A6FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false}
               tickFormatter={v => formatCurrency(v, true)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="total_all"   name="Total ALL"    stroke={CHROME.accent} strokeWidth={2}   fill="url(#goldGrad)" />
        <Area type="monotone" dataKey="total_loans" name="Active Loans" stroke="#58A6FF" strokeWidth={1.5} fill="url(#azureGrad)" strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PortfolioStackedChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false}
               tickFormatter={v => formatCurrency(v, true)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '10px', color: CHROME.text }} />
        <Bar dataKey="sfr"           name="SFR"         fill={COLORS.sfr}           stackId="a" />
        <Bar dataKey="mfr"           name="MFR"         fill={COLORS.mfr}           stackId="a" />
        <Bar dataKey="raw_land"      name="Raw Land"    fill={COLORS.raw_land}      stackId="a" />
        <Bar dataKey="and"           name="A&D"         fill={COLORS.and}           stackId="a" />
        <Bar dataKey="finished_lots" name="Fin. Lots"   fill={COLORS.finished_lots} stackId="a" />
        <Bar dataKey="land_bucket"   name="Land Bucket" fill={COLORS.land_bucket}   stackId="a" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function IncomeChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={12}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false}
               tickFormatter={v => formatCurrency(v, true)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '10px', color: CHROME.text }} />
        <Bar dataKey="yield_active"      name="Active Yield"   fill="#58A6FF" stackId="i" />
        <Bar dataKey="yield_projected"   name="Proj. Yield"    fill={CHROME.accent} stackId="i" />
        <Bar dataKey="yield_land_bucket" name="LB Yield"       fill="#79C0FF" stackId="i" />
        <Bar dataKey="profit_sharing"    name="Profit Sharing" fill={CHROME.success} stackId="i" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function VarianceChart({ data }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data.slice(1)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={12}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHROME.text, fontSize: 10 }} tickLine={false} axisLine={false}
               tickFormatter={v => formatCurrency(v, true)} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke={CHROME.axisStrong} />
        <Bar dataKey="variance" name="MoM Change" fill={CHROME.accent} radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
