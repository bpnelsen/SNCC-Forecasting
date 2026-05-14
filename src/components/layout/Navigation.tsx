'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Settings2, Upload, History, Building2, Landmark, ClipboardList, CreditCard,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const nav = [
  { href: '/dashboard',    label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/loans',        label: 'Loans',           icon: CreditCard },
  { href: '/forecast',     label: 'Forecast',        icon: TrendingUp },
  { href: '/originations', label: 'New Originations', icon: ClipboardList },
  { href: '/land-bucket',  label: 'Land Bucket',     icon: Landmark },
  { href: '/assumptions',  label: 'Assumptions',     icon: Settings2 },
  { href: '/import',       label: 'Import',          icon: Upload },
  { href: '/versions',     label: 'Versions',        icon: History },
]

export function Navigation() {
  const path = usePathname()
  return (
    <nav className="w-52 shrink-0 flex flex-col bg-surface border-r border-border py-5">
      {/* Logo */}
      <div className="px-5 mb-7">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-xs font-semibold text-fg-strong leading-none">SNCC</div>
            <div className="text-[10px] text-fg-dim leading-none mt-0.5">Forecasting</div>
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
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-dim hover:text-fg hover:bg-border'
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
      <div className="px-5 pt-4 border-t border-border space-y-2">
        <ThemeToggle />
        <div>
          <div className="text-[10px] text-fg-dim">Security National</div>
          <div className="text-[10px] text-border-strong">Financial Corporation</div>
        </div>
      </div>
    </nav>
  )
}
