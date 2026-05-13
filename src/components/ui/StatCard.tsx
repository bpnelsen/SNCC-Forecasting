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
    <div className={`card p-4 ${accent ? 'border-[#D4A853]/30' : ''}`}>
      <div className="text-[10px] font-medium text-[#8B949E] uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={`text-xl font-semibold font-mono ${accent ? 'text-[#D4A853]' : 'text-[#E6EDF3]'}`}>
        {value}
      </div>
      {subLabel && (
        <div className="text-[10px] text-[#8B949E] mt-0.5">{subLabel}</div>
      )}
      {delta && (
        <div className={`text-[10px] mt-1.5 ${
          deltaPositive === undefined
            ? 'text-[#8B949E]'
            : deltaPositive
              ? 'text-[#3FB950]'
              : 'text-[#F85149]'
        }`}>
          {delta}
        </div>
      )}
    </div>
  )
}
