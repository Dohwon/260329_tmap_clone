import React from 'react'
import SearchSheet from '../components/Search/SearchSheet'
import useAppStore from '../store/appStore'

export default function SearchScreen() {
  const { setActiveTab } = useAppStore()
  return (
    <SearchSheet onClose={() => setActiveTab('home')} />
  )
}
