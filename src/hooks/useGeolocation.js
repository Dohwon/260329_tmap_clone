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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export default function useGeolocation() {
  const { setUserLocation, setMapCenter, setUserAddress } = useAppStore()
  const firstFix = useRef(false)
  const addressTimer = useRef(null)
  const watchIdRef = useRef(null)
  const lastGeocodedRef = useRef(null) // { lat, lng, time }
  const lastAcceptedRef = useRef(null) // { lat, lng, accuracy, speedKmh, heading, time }

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation({ lat: 37.5665, lng: 126.9780, speedKmh: 0, heading: 0, accuracy: null })
      setUserAddress('서울특별시 중구 세종대로')
      return
    }

    const normalizeHeading = (heading, fallback = 0) => {
      const value = Number(heading)
      if (!Number.isFinite(value) || value < 0) return fallback
      return value % 360
    }

    const filterLocation = (nextLoc) => {
      const prev = lastAcceptedRef.current
      if (!prev) {
        lastAcceptedRef.current = { ...nextLoc, time: Date.now() }
        return nextLoc
      }

      const now = Date.now()
      const elapsedSec = Math.max(0.25, (now - prev.time) / 1000)
      const nextAccuracy = Number.isFinite(Number(nextLoc.accuracy)) ? Number(nextLoc.accuracy) : 999
      const prevAccuracy = Number.isFinite(Number(prev.accuracy)) ? Number(prev.accuracy) : 999
      const distanceFromPrevM = distanceM(prev.lat, prev.lng, nextLoc.lat, nextLoc.lng)
      const speedKmh = Math.max(
        0,
        Number(nextLoc.speedKmh ?? 0),
        Number(prev.speedKmh ?? 0),
        (distanceFromPrevM / Math.max(1, elapsedSec)) * 3.6,
      )

      const plausibleJumpM = Math.max(
        12,
        ((Math.max(5, speedKmh) * 1000) / 3600) * elapsedSec * 2.2 + (nextAccuracy * 0.8) + 6,
      )
      const isVeryPoorFix = nextAccuracy >= 45
      const isStationaryOrSlow = speedKmh <= 8
      const keepPreviousForPoorFix = isVeryPoorFix && isStationaryOrSlow && distanceFromPrevM <= Math.max(18, nextAccuracy * 1.2)
      const rejectAsJump = elapsedSec <= 4 && distanceFromPrevM > plausibleJumpM && nextAccuracy >= Math.min(60, prevAccuracy + 6)

      if (keepPreviousForPoorFix || rejectAsJump) {
        const held = {
          ...nextLoc,
          lat: prev.lat,
          lng: prev.lng,
          heading: normalizeHeading(nextLoc.heading, prev.heading ?? 0),
          accuracy: Math.min(nextAccuracy, prevAccuracy),
          gpsJumpFiltered: true,
        }
        lastAcceptedRef.current = {
          ...prev,
          speedKmh: Number(held.speedKmh ?? prev.speedKmh ?? 0),
          heading: normalizeHeading(held.heading, prev.heading ?? 0),
          accuracy: held.accuracy,
          time: now,
        }
        return held
      }

      const shouldHoldStationary = isStationaryOrSlow && distanceFromPrevM <= Math.max(6, nextAccuracy * 0.35)
      const smoothingWeight = shouldHoldStationary
        ? 0
        : distanceFromPrevM <= 12
          ? 0.22
          : distanceFromPrevM <= 28
            ? 0.48
            : 1
      const lat = (smoothingWeight === 1)
        ? nextLoc.lat
        : prev.lat + ((nextLoc.lat - prev.lat) * smoothingWeight)
      const lng = (smoothingWeight === 1)
        ? nextLoc.lng
        : prev.lng + ((nextLoc.lng - prev.lng) * smoothingWeight)

      let heading = normalizeHeading(nextLoc.heading, prev.heading ?? 0)
      const prevHeading = normalizeHeading(prev.heading, heading)
      const headingDiffRaw = ((heading - prevHeading + 540) % 360) - 180
      const headingBlend = distanceFromPrevM >= 10 ? 0.7 : 0.32
      heading = normalizeHeading(prevHeading + (headingDiffRaw * headingBlend), prevHeading)

      const filtered = {
        ...nextLoc,
        lat: shouldHoldStationary ? prev.lat : Number(lat.toFixed(7)),
        lng: shouldHoldStationary ? prev.lng : Number(lng.toFixed(7)),
        heading: Number(heading.toFixed(1)),
      }
      lastAcceptedRef.current = {
        ...filtered,
        speedKmh: Number(filtered.speedKmh ?? 0),
        accuracy: clamp(Math.min(nextAccuracy, prevAccuracy + 12), 3, 999),
        time: now,
      }
      return filtered
    }

    const success = (pos) => {
      const rawLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speedKmh: Math.max(0, Math.round((pos.coords.speed ?? 0) * 3.6)),
        heading: pos.coords.heading ?? 0,
        accuracy: pos.coords.accuracy ?? null,
      }
      const loc = filterLocation(rawLoc)
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
        enableHighAccuracy: Boolean(navigating),
        // 일반 화면은 과도한 GPS 흔들림을 줄이기 위해 약간의 캐시를 허용
        maximumAge: navigating ? 500 : 3000,
        timeout: navigating ? 7000 : 10000,
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
