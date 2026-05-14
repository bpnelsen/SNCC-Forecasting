interface StatCardProps {
  label: string
  value: string
  delta?: string
  subLabel?: string
  accent?: boolean
  deltaPositive?: boolean
}

export function StatCard({ label, value, delta, subLabel, accent, deltaPositive }: StatCardProps) {
  return (
    <div className={`card p-4 ${accent ? 'border-accent/30' : ''}`}>
      <div className="text-[10px] font-medium text-fg-dim uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={`text-xl font-semibold font-mono ${accent ? 'text-accent' : 'text-fg-strong'}`}>
        {value}
      </div>
      {subLabel && (
        <div className="text-[10px] text-fg-dim mt-0.5">{subLabel}</div>
      )}
      {delta && (
        <div className={`text-[10px] mt-1.5 ${
          deltaPositive === undefined
            ? 'text-fg-dim'
            : deltaPositive
              ? 'text-success-light'
              : 'text-danger'
        }`}>
          {delta}
        </div>
      )}
    </div>
  )
}
