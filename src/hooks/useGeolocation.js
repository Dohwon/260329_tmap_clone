import { useEffect, useRef } from 'react'
import useAppStore from '../store/appStore'
import { reverseGeocode } from '../services/tmapService'

// 하버사인 거리 계산 (미터 단위)
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function useGeolocation() {
  const { setUserLocation, setMapCenter, setUserAddress } = useAppStore()
  const firstFix = useRef(false)
  const addressTimer = useRef(null)
  const watchIdRef = useRef(null)
  const lastGeocodedRef = useRef(null) // { lat, lng, time }

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
      // 역지오코딩: 50m 이상 이동 + 마지막 호출 후 5초 이상 경과한 경우에만 호출
      const prev = lastGeocodedRef.current
      const movedFar = !prev || distanceM(prev.lat, prev.lng, loc.lat, loc.lng) >= 50
      const longEnough = !prev || (Date.now() - prev.time) >= 5000
      if (movedFar || longEnough) {
        clearTimeout(addressTimer.current)
        lastGeocodedRef.current = { lat: loc.lat, lng: loc.lng, time: Date.now() }
        addressTimer.current = setTimeout(async () => {
          const address = await reverseGeocode(loc.lat, loc.lng)
          if (address) setUserAddress(address)
        }, 800)
      }
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

    const restartWatch = (navigating) => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
        enableHighAccuracy: true,
        // 내비 중에는 캐시 없이 항상 최신 GPS 값 사용, 일반 모드는 1초 캐시 허용
        maximumAge: navigating ? 0 : 1000,
        timeout: 8000,
      })
    }

    // 빠른 응답을 위해 low accuracy 먼저, 이후 high accuracy watch
    navigator.geolocation.getCurrentPosition(success, error, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 30000,
    })

    restartWatch(false)

    // 내비 시작/종료 시 GPS 수신 주기 전환
    const unsubscribe = useAppStore.subscribe(
      (state, prevState) => {
        if (state.isNavigating !== prevState.isNavigating) {
          restartWatch(state.isNavigating)
        }
      },
    )

    return () => {
      clearTimeout(addressTimer.current)
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      unsubscribe()
    }
  }, [])
}
