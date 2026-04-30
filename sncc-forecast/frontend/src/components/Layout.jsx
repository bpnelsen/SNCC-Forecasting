import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import VersionSelector from './VersionSelector'
import ExportButton from './ExportButton'

const LOAN_TYPES = [
  { label: 'SFR', path: '/loans/SFR' },
  { label: 'Multifamily', path: '/loans/MF' },
  { label: 'A&D', path: '/loans/AD' },
  { label: 'Raw Land', path: '/loans/RawLand' },
  { label: 'Finished Lots', path: '/loans/FinishedLots' },
]

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-4 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function Layout() {
  const [loansExpanded, setLoansExpanded] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0f172a] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-sm leading-tight">SNCC Forecast</h1>
              <p className="text-slate-400 text-xs">Financial Planning</p>
            </div>
          </div>
          <VersionSelector />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavItem to="/dashboard">Dashboard</NavItem>
          <NavItem to="/import">Import Data</NavItem>

          {/* Loans expandable */}
          <div>
            <button
              onClick={() => setLoansExpanded(!loansExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <span>Loans</span>
              <span className="text-slate-400">{loansExpanded ? '▾' : '▸'}</span>
            </button>
            {loansExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {LOAN_TYPES.map(lt => (
                  <NavItem key={lt.path} to={lt.path}>{lt.label}</NavItem>
                ))}
              </div>
            )}
          </div>

          <NavItem to="/nhc">NHC Forecast</NavItem>
          <NavItem to="/land-bucket">Land Bucket</NavItem>
          <NavItem to="/hhh">HHH Investments</NavItem>
          <NavItem to="/profit-sharing">Profit Sharing</NavItem>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700">
          <ExportButton compact />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
