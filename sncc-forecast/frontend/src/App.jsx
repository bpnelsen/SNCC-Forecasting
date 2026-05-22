import React, { createContext, useContext, useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Import from './pages/Import'
import Loans from './pages/Loans'
import NHC from './pages/NHC'
import LandBucket from './pages/LandBucket'
import HHH from './pages/HHH'
import ProfitSharing from './pages/ProfitSharing'
import { getVersions } from './api/versions'

export const VersionContext = createContext(null)

export function useVersion() {
  return useContext(VersionContext)
}

export default function App() {
  const [versions, setVersions] = useState([])
  const [selectedVersionId, setSelectedVersionId] = useState(null)

  useEffect(() => {
    getVersions().then(res => {
      const versionList = res.data
      setVersions(versionList)
      if (versionList.length > 0) {
        setSelectedVersionId(versionList[0].id)
      }
    }).catch(console.error)
  }, [])

  const refreshVersions = () => {
    return getVersions().then(res => {
      const versionList = res.data
      setVersions(versionList)
      return versionList
    })
  }

  return (
    <VersionContext.Provider value={{ versions, selectedVersionId, setSelectedVersionId, refreshVersions }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="import" element={<Import />} />
          <Route path="loans/:type" element={<Loans />} />
          <Route path="nhc" element={<NHC />} />
          <Route path="land-bucket" element={<LandBucket />} />
          <Route path="hhh" element={<HHH />} />
          <Route path="profit-sharing" element={<ProfitSharing />} />
        </Route>
      </Routes>
    </VersionContext.Provider>
  )
}
