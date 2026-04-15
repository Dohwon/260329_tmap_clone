import React from 'react'
import useAppStore from './store/appStore'
import useGeolocation from './hooks/useGeolocation'
import BottomTabBar from './components/Common/BottomTabBar'
import HomeScreen from './screens/HomeScreen'
import SearchScreen from './screens/SearchScreen'
import FavoritesScreen from './screens/FavoritesScreen'
import MoreScreen from './screens/MoreScreen'

export default function App() {
  const { activeTab } = useAppStore()
  useGeolocation()

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-100" style={{ maxWidth: '430px', margin: '0 auto' }}>
      {/* 화면 콘텐츠 */}
      <div className="absolute inset-0 pb-16">
        {activeTab === 'home'      && <HomeScreen />}
        {activeTab === 'search'    && <SearchScreen />}
        {activeTab === 'favorites' && <FavoritesScreen />}
        {activeTab === 'more'      && <MoreScreen />}
      </div>

      {/* 하단 탭바 */}
      <BottomTabBar />
    </div>
  )
}
