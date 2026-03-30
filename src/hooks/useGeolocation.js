import { useEffect, useRef } from 'react'
import useAppStore from '../store/appStore'

export default function useGeolocation() {
  const { setUserLocation, setMapCenter } = useAppStore()
  const firstFix = useRef(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation({ lat: 37.5665, lng: 126.9780 })
      return
    }

    const success = (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setUserLocation(loc)
      // 첫 위치 확정 시에만 지도 중심 이동
      if (!firstFix.current) {
        firstFix.current = true
        setMapCenter([loc.lat, loc.lng], 15)
      }
    }
    const error = () => {
      if (!firstFix.current) {
        firstFix.current = true
        setUserLocation({ lat: 37.5665, lng: 126.9780 })
      }
    }

    // 빠른 응답을 위해 low accuracy 먼저, 이후 high accuracy watch
    navigator.geolocation.getCurrentPosition(success, error, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 30000,
    })

    const watchId = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
}
