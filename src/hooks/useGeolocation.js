import { useEffect, useRef } from 'react'
import useAppStore from '../store/appStore'
import { reverseGeocode } from '../services/tmapService'

export default function useGeolocation() {
  const { setUserLocation, setMapCenter, setUserAddress } = useAppStore()
  const firstFix = useRef(false)
  const addressTimer = useRef(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation({ lat: 37.5665, lng: 126.9780, speedKmh: 0, heading: 0, accuracy: null })
      setUserAddress('서울특별시 중구 세종대로')
      return
    }

    const success = (pos) => {
      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speedKmh: Math.max(0, Math.round((pos.coords.speed ?? 0) * 3.6)),
        heading: pos.coords.heading ?? 0,
        accuracy: pos.coords.accuracy ?? null,
      }
      setUserLocation(loc)
      clearTimeout(addressTimer.current)
      addressTimer.current = setTimeout(async () => {
        const address = await reverseGeocode(loc.lat, loc.lng)
        if (address) setUserAddress(address)
      }, 300)
      // 첫 위치 확정 시에만 지도 중심 이동
      if (!firstFix.current) {
        firstFix.current = true
        setMapCenter([loc.lat, loc.lng], 13)
      }
    }
    const error = () => {
      if (!firstFix.current) {
        firstFix.current = true
        setUserLocation({ lat: 37.5665, lng: 126.9780, speedKmh: 0, heading: 0, accuracy: null })
        setUserAddress('서울특별시 중구 세종대로')
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

    return () => {
      clearTimeout(addressTimer.current)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])
}
