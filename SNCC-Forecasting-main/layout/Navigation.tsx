'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Settings2, Upload, History, Building2
} from 'lucide-react'

const nav = [
  { href: '/dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/forecast',    label: 'Forecast',     icon: TrendingUp },
  { href: '/assumptions', label: 'Assumptions',  icon: Settings2 },
  { href: '/import',      label: 'Import',       icon: Upload },
  { href: '/versions',    label: 'Versions',     icon: History },
]

export function Navigation() {
  const path = usePathname()
  return (
    <nav className="w-52 shrink-0 flex flex-col bg-[#161B22] border-r border-[#21262D] py-5">
      {/* Logo */}
      <div className="px-5 mb-7">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#D4A853]/20 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-[#D4A853]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E6EDF3] leading-none">SNCC</div>
            <div className="text-[10px] text-[#8B949E] leading-none mt-0.5">Forecasting</div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex-1 px-2 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
                ${active
                  ? 'bg-[#D4A853]/15 text-[#D4A853]'
                  : 'text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#21262D]'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 pt-4 border-t border-[#21262D]">
        <div className="text-[10px] text-[#8B949E]">Security National</div>
        <div className="text-[10px] text-[#30363D]">Financial Corporation</div>
      </div>
    </nav>
  )
}
