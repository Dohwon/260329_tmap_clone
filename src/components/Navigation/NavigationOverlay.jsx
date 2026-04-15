import React, { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/appStore'
import MergeOptionsSheet from './MergeOptionsSheet'
import { formatEta } from '../Route/RouteCard'
import { SCENIC_SEGMENTS } from '../../data/scenicRoads'
import { PRESET_INFO } from '../../data/mockData'
import { fetchUpcomingFuelContext, getDiscountedFuelPrice, searchNearbyPOIs } from '../../services/tmapService'
import {
  analyzeRouteProgress,
  formatGuidanceDistance,
  getGuidanceInstruction,
  getGuidancePriority,
  getCurrentRouteSegment,
  getLaneGuidance,
  getRemainingEta,
  getUpcomingGuidanceList,
  getUpcomingMergeOptions,
  haversineM,
} from '../../utils/navigationLogic'

function getPolylineDistanceKm(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0
  let totalKm = 0
  for (let index = 0; index < polyline.length - 1; index += 1) {
    totalKm += haversineM(polyline[index][0], polyline[index][1], polyline[index + 1][0], polyline[index + 1][1]) / 1000
  }
  return Number(totalKm.toFixed(2))
}

function samplePolyline(polyline = [], sampleSize = 12) {
  if (!Array.isArray(polyline) || polyline.length === 0) return []
  if (polyline.length <= sampleSize) return polyline
  return Array.from({ length: sampleSize }, (_, index) => {
    const ratio = index / Math.max(1, sampleSize - 1)
    return polyline[Math.min(polyline.length - 1, Math.round((polyline.length - 1) * ratio))]
  })
}

function areSimilarPolylines(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false
  const aStart = a[0]
  const bStart = b[0]
  const aEnd = a[a.length - 1]
  const bEnd = b[b.length - 1]
  if (haversineM(aStart[0], aStart[1], bStart[0], bStart[1]) > 250) return false
  if (haversineM(aEnd[0], aEnd[1], bEnd[0], bEnd[1]) > 250) return false

  const aSample = samplePolyline(a)
  const bSample = samplePolyline(b, aSample.length)
  let diffSumKm = 0
  for (let index = 0; index < Math.min(aSample.length, bSample.length); index += 1) {
    diffSumKm += haversineM(aSample[index][0], aSample[index][1], bSample[index][0], bSample[index][1]) / 1000
  }
  const avgDiffKm = diffSumKm / Math.max(1, Math.min(aSample.length, bSample.length))
  return avgDiffKm <= 0.12 && Math.abs(getPolylineDistanceKm(a) - getPolylineDistanceKm(b)) <= 1.5
}

function getLanePattern(guidance) {
  const laneText = String(guidance?.laneHint ?? guidance?.instructionText ?? guidance?.description ?? '')
    .replace(/\s+/g, ' ')
    .replace(/왼쪽/g, '좌측')
    .replace(/오른쪽/g, '우측')
    .trim()

  if (laneText.includes('우측 2개 차로')) {
    return ['muted', 'forward', 'active-right', 'active-right']
  }
  if (laneText.includes('좌측 2개 차로')) {
    return ['active-left', 'active-left', 'forward', 'muted']
  }
  if (laneText.includes('가운데 2개 차로')) {
    return ['muted', 'active-forward', 'active-forward', 'muted']
  }
  if (/1\s*(?:~|-)\s*2차로/.test(laneText)) {
    return ['active-left', 'active-left', 'forward', 'muted']
  }
  if (/3\s*(?:~|-)\s*4차로/.test(laneText)) {
    return ['muted', 'forward', 'active-right', 'active-right']
  }

  const t = Number(guidance?.turnType)
  if (t === 12 || t === 16 || t === 18) {
    return ['active-left', 'forward', 'muted']
  }
  if (t === 13 || t === 17 || t === 19) {
    return ['muted', 'forward', 'active-right']
  }
  if (t >= 125 && t <= 130) {
    return ['muted', 'active-right', 'active-right']
  }
  return ['forward', 'active-forward', 'forward']
}

function getLaneArrow(lane) {
  if (lane === 'active-left') return '↖'
  if (lane === 'active-right') return '↗'
  return '↑'
}

function stripLaneMention(text = '') {
  return String(text)
    .replace(/(좌측|우측|가운데)\s*\d+개?\s*차로(?:를)?\s*(이용|준비|진입|유지|이동)/g, '')
    .replace(/(좌측|우측|가운데)\s*\d+\s*(?:~|-)\s*\d+차로(?:를)?\s*(이용|준비|진입|유지|이동)/g, '')
    .replace(/(\d+\s*(?:~|-)\s*\d+차로|\d+차로)(?:를)?\s*(이용|준비|진입|유지|이동)/g, '')
    .replace(/([좌우]측|왼쪽|오른쪽|가운데|중앙)[^.,]{0,18}차로/g, '')
    .replace(/차선\s*준비/g, '')
    .replace(/차로\s*준비/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim()
}

function createBrowserSpeech(text) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 1
  return utterance
}

function playAlertChime(repeat = 1) {
  if (typeof window === 'undefined') return
  const AudioCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtor) return

  const ctx = new AudioCtor()
  const now = ctx.currentTime
  for (let index = 0; index < repeat; index += 1) {
    const startAt = now + (index * 0.22)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = index === repeat - 1 ? 1220 : 980
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startAt)
    osc.stop(startAt + 0.18)
  }
  window.setTimeout(() => ctx.close().catch(() => {}), 1200)
}

function buildCameraAlertSpeech(camera, distanceM, threshold) {
  const roundedDistance = Math.max(100, Math.round(distanceM / 10) * 10)
  const cameraLabel = camera?.type === 'section_start'
    ? '구간단속 시작'
    : camera?.type === 'section_end'
      ? '구간단속 종료'
      : '과속카메라'

  if (threshold === '100m') {
    return `100미터 앞 ${cameraLabel}입니다.`
  }

  return `${roundedDistance}미터 앞 ${cameraLabel}입니다.`
}

function buildHazardAlertSpeech(hazard, distanceM, threshold) {
  const roundedDistance = Math.max(100, Math.round(distanceM / 10) * 10)
  if (hazard?.type === 'school_zone') {
    return threshold === '100m'
      ? '100미터 앞 어린이 보호구역입니다. 제한속도 30킬로입니다.'
      : `${roundedDistance}미터 앞 어린이 보호구역입니다. 감속하세요.`
  }

  return threshold === '100m'
    ? '100미터 앞 과속방지턱입니다. 감속하세요.'
    : `${roundedDistance}미터 앞 과속방지턱입니다. 감속하세요.`
}

function formatRestaurantMeta(poi = {}) {
  const rating = Number(poi?.googleRating)
  if (!Number.isFinite(rating) || rating <= 0) {
    return poi?.googleRatingSource === 'lazy' ? '카드 열면 평점 조회' : '별점 정보 없음'
  }
  const reviewCount = Number(poi?.googleUserRatingCount)
  return `Google ${rating.toFixed(1)}${Number.isFinite(reviewCount) && reviewCount > 0 ? ` · 리뷰 ${reviewCount.toLocaleString()}` : ''}`
}

function hasValidCoordPair(coord) {
  return Array.isArray(coord)
    && coord.length >= 2
    && Number.isFinite(Number(coord[0]))
    && Number.isFinite(Number(coord[1]))
}

export default function NavigationOverlay() {
  const {
    isNavigating, stopNavigation, destination, routes, selectedRouteId,
    mergeOptions, userLocation, navigationMatchedLocation, saveRoute, savedRoutes, drivePathHistory, cameraReports, reportCamera,
    navAutoFollow, setNavAutoFollow, addWaypoint, searchRoute, waypoints,
    refreshNavigationRoute, navigationLastRefreshedAt, isRefreshingNavigation,
    settings, driverPreset, setDriverPreset, showRoutePanel, openSearchOverlay, safetyHazards, refreshSafetyHazards,
    isDriveSimulation, startDriveSimulation, stopDriveSimulation, triggerDriveSimulationOffRoute,
  } = useAppStore()
  const [showMerge, setShowMerge] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showCameraReport, setShowCameraReport] = useState(null) // camera object
  const [scenicToast, setScenicToast] = useState(null) // { emoji, name, type }
  const [showNearbyPanel, setShowNearbyPanel] = useState(false)
  const [nearbyPOIs, setNearbyPOIs] = useState([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyCategory, setNearbyCategory] = useState('주유소')
  const [isRouteSheetCollapsed, setIsRouteSheetCollapsed] = useState(true)
  const [alertFlash, setAlertFlash] = useState(null)
  const [upcomingFuelContext, setUpcomingFuelContext] = useState({ nextRouteFuel: null, nextRestFuelStops: [] })
  const [restaurantCandidates, setRestaurantCandidates] = useState([])
  const [restaurantLoading, setRestaurantLoading] = useState(false)
  const segmentRef = useRef(null)
  const wakeLockRef = useRef(null)
  const nearCameraNotifiedRef = useRef(new Set()) // 이미 알린 카메라 id
  const notifiedScenicRef = useRef(new Set()) // 이미 알린 scenic segment id
  const spokenGuidanceRef = useRef(new Set())
  const spokenSafetyRef = useRef(new Set())
  const startedVoiceRef = useRef(false)
  const routeSheetTouchStartRef = useRef(null)
  const routeSheetTouchHandledRef = useRef(false)
  const flashTimerRef = useRef(null)
  const speechQueueRef = useRef([])
  const speechBusyRef = useRef(false)
  const activeAudioRef = useRef(null)
  const activeAudioUrlRef = useRef(null)
  const lastFuelRefreshAtRef = useRef(0)
  const lastFuelRefreshCoordRef = useRef(null)
  const lastRestaurantRefreshAtRef = useRef(0)
  const lastRestaurantRefreshCoordRef = useRef(null)
  const arrivedRef = useRef(false) // 도착 중복 발동 방지
  const offRouteEvidenceRef = useRef({ count: 0, reason: null })

  // 화면 꺼짐 방지
  useEffect(() => {
    if (!isNavigating) return
    let released = false
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          wakeLockRef.current.addEventListener('release', () => {
            if (!released) acquireWakeLock()
          })
        }
      } catch { /* 미지원 기기 무시 */ }
    }
    acquireWakeLock()
    return () => {
      released = true
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isNavigating])

  // 카메라 근접 감지 (100m 이내 → 신고 프롬프트)
  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const route = routes.find(r => r.id === selectedRouteId)
    const cameras = route?.cameras ?? []
    for (const cam of cameras) {
      if (!hasValidCoordPair(cam?.coord)) continue
      if (nearCameraNotifiedRef.current.has(cam.id)) continue
      const dist = haversineM(userLocation.lat, userLocation.lng, cam.coord[0], cam.coord[1])
      if (dist < 120) {
        nearCameraNotifiedRef.current.add(cam.id)
        // 150m 내 통과 후 신고 팝업 (1.5초 딜레이)
        setTimeout(() => setShowCameraReport(cam), 1500)
      }
    }
  }, [userLocation])

  // 경관 구간 진입 감지 → 토스트 알림
  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const NOTIFY_KM = 4 // 이 거리 내에 들어오면 진입으로 판단
    for (const seg of SCENIC_SEGMENTS) {
      if (notifiedScenicRef.current.has(seg.id)) continue
      const [mLat, mLng] = seg.segmentMid
      const dist = haversineM(userLocation.lat, userLocation.lng, mLat, mLng) / 1000
      if (dist <= NOTIFY_KM) {
        notifiedScenicRef.current.add(seg.id)
        setScenicToast({ emoji: seg.emoji, name: seg.name, type: seg.scenicType })
        setTimeout(() => setScenicToast(null), 5000)
      }
    }
  }, [userLocation, isNavigating])

  const route = routes.find(r => r.id === selectedRouteId)
  const guidanceLocation = navigationMatchedLocation ?? userLocation
  const { progress: routeProgress, nextAction } = getGuidancePriority(route, guidanceLocation, mergeOptions)
  const guidanceList = getUpcomingGuidanceList(route, guidanceLocation, mergeOptions, 5)
  const offRouteProgress = analyzeRouteProgress(route, userLocation)
  const currentRouteSegment = getCurrentRouteSegment(route, guidanceLocation)
  const liveMergeOptions = getUpcomingMergeOptions(mergeOptions, routeProgress.progressKm)
  const nextMergeOpt = liveMergeOptions.find((option) => option.remainingDistanceKm > 0.03) ?? liveMergeOptions[0]
  const remainingEta = getRemainingEta(route, routeProgress.remainingKm)
  const nextCameraInfo = useMemo(() => {
    if (!userLocation) return null
    const nearest = (route?.cameras ?? [])
      .filter((camera) => hasValidCoordPair(camera?.coord))
      .map((camera) => ({
        ...camera,
        distanceM: haversineM(userLocation.lat, userLocation.lng, camera.coord[0], camera.coord[1]),
      }))
      .filter((camera) => camera.distanceM >= 0 && camera.distanceM <= 8000)
      .sort((a, b) => a.distanceM - b.distanceM)[0]
    if (!nearest) return null
    return {
      ...nearest,
      distanceLabel: nearest.distanceM < 1000
        ? `${Math.max(50, Math.round(nearest.distanceM / 10) * 10)}m`
        : `${Number((nearest.distanceM / 1000).toFixed(1))}km`,
    }
  }, [route?.cameras, userLocation])
  const nextSectionInfo = useMemo(
    () => (nextCameraInfo?.type === 'section_start' ? nextCameraInfo : null),
    [nextCameraInfo]
  )

  const triggerAlertFlash = (tone = 'red') => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    setAlertFlash(tone)
    flashTimerRef.current = window.setTimeout(() => setAlertFlash(null), 520)
  }

  const flushSpeechQueue = () => {
    if (speechBusyRef.current) return
    const nextSpeech = speechQueueRef.current.shift()
    if (!nextSpeech) return

    speechBusyRef.current = true
    playSpeech(nextSpeech).finally(() => {
      speechBusyRef.current = false
      flushSpeechQueue()
    })
  }

  const enqueueSpeech = (text) => {
    if (!settings.voiceGuidance || !text) return
    if (speechQueueRef.current.length >= 4) {
      speechQueueRef.current = speechQueueRef.current.slice(-3)
    }
    speechQueueRef.current.push(text)
    flushSpeechQueue()
  }

  const stopActiveAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause()
      activeAudioRef.current.src = ''
      activeAudioRef.current = null
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current)
      activeAudioUrlRef.current = null
    }
  }

  const playSpeech = async (text) => {
    try {
      const response = await fetch('/api/tts/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          stopActiveAudio()
          const url = URL.createObjectURL(blob)
          activeAudioUrlRef.current = url
          const audio = new Audio(url)
          activeAudioRef.current = audio
          await new Promise((resolve) => {
            audio.onended = () => resolve()
            audio.onerror = () => resolve()
            audio.play().catch(() => resolve())
          })
          stopActiveAudio()
          return
        }
      }
    } catch {
      // Google TTS 실패 시 브라우저 TTS로 폴백
    }

    if (!window.speechSynthesis) return
    await new Promise((resolve) => {
      const utterance = createBrowserSpeech(text)
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }

  const speakAlert = (text, { chimeRepeat = 1, flashTone = null } = {}) => {
    if (!text) return
    if (flashTone) triggerAlertFlash(flashTone)
    playAlertChime(chimeRepeat)
    enqueueSpeech(text)
  }

  useEffect(() => {
    if (!isNavigating || route?.source !== 'live') return
    const timer = window.setInterval(() => {
      refreshNavigationRoute('traffic-refresh')
    }, 120000)
    return () => window.clearInterval(timer)
  }, [isNavigating, refreshNavigationRoute, route?.source])

  useEffect(() => {
    if (!isNavigating) return
    refreshSafetyHazards()
    const timer = window.setInterval(() => {
      refreshSafetyHazards()
    }, 90000)
    return () => window.clearInterval(timer)
  }, [isNavigating, refreshSafetyHazards])

  useEffect(() => {
    if (isNavigating) return
    startedVoiceRef.current = false
    spokenGuidanceRef.current.clear()
    spokenSafetyRef.current.clear()
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    setAlertFlash(null)
    speechQueueRef.current = []
    speechBusyRef.current = false
    stopActiveAudio()
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [isNavigating])

  useEffect(() => {
    if (!isNavigating) {
      setIsRouteSheetCollapsed(true)
      setUpcomingFuelContext({ nextRouteFuel: null, nextRestFuelStops: [] })
      setRestaurantCandidates([])
      return
    }
    setIsRouteSheetCollapsed(true)
  }, [isNavigating, selectedRouteId])

  useEffect(() => {
    if (!isNavigating || !route?.polyline?.length || !userLocation) return
    const now = Date.now()
    const lastCoord = lastFuelRefreshCoordRef.current
    const movedKm = lastCoord
      ? haversineM(lastCoord.lat, lastCoord.lng, userLocation.lat, userLocation.lng) / 1000
      : Infinity
    const shouldRefresh = (
      !lastCoord ||
      movedKm >= 0.8 ||
      now - lastFuelRefreshAtRef.current > 90000
    )
    if (!shouldRefresh) return

    lastFuelRefreshAtRef.current = now
    lastFuelRefreshCoordRef.current = { lat: userLocation.lat, lng: userLocation.lng }

    let cancelled = false
    fetchUpcomingFuelContext(route.polyline, userLocation, settings)
      .then((context) => {
        if (!cancelled) {
          setUpcomingFuelContext(context ?? { nextRouteFuel: null, nextRestFuelStops: [] })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUpcomingFuelContext({ nextRouteFuel: null, nextRestFuelStops: [] })
        }
      })

    return () => {
      cancelled = true
    }
  }, [isNavigating, route?.id, route?.polyline, settings, userLocation])

  useEffect(() => {
    if (!isNavigating || !route?.polyline?.length || !userLocation) return
    const now = Date.now()
    const lastCoord = lastRestaurantRefreshCoordRef.current
    const movedKm = lastCoord
      ? haversineM(lastCoord.lat, lastCoord.lng, userLocation.lat, userLocation.lng) / 1000
      : Infinity
    const shouldRefresh = (
      !lastCoord ||
      movedKm >= 3 ||
      now - lastRestaurantRefreshAtRef.current > 600000
    )
    if (!shouldRefresh) return

    lastRestaurantRefreshAtRef.current = now
    lastRestaurantRefreshCoordRef.current = { lat: userLocation.lat, lng: userLocation.lng }
    setRestaurantLoading(true)

    let cancelled = false
    searchNearbyPOIs('음식점', userLocation.lat, userLocation.lng, {
      routePolyline: route.polyline,
    })
      .then((pois) => {
        if (cancelled) return
        setRestaurantCandidates(
          (pois ?? [])
            .filter((poi) => poi.isRouteCorridor)
            .sort((a, b) => {
              const ratingDiff = (Number(b.googleRating) || -1) - (Number(a.googleRating) || -1)
              if (ratingDiff !== 0) return ratingDiff
              const reviewDiff = (Number(b.googleUserRatingCount) || -1) - (Number(a.googleUserRatingCount) || -1)
              if (reviewDiff !== 0) return reviewDiff
              return (a.routeDistanceKm ?? Infinity) - (b.routeDistanceKm ?? Infinity)
            })
            .slice(0, 3)
        )
        setRestaurantLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setRestaurantCandidates([])
        setRestaurantLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isNavigating, route?.id, route?.polyline, userLocation])

  // 경로 이탈 감지 — 3초마다 폴링
  // useEffect 의존성 기반은 distanceToRouteM 고정 시 cooldown이 지나도 재실행 안 되는 버그 있어 폴링으로 대체
  useEffect(() => {
    if (!isNavigating) return
    const id = window.setInterval(() => {
      const s = useAppStore.getState()
      const currentRoute = s.routes.find((r) => r.id === s.selectedRouteId)
      if (!currentRoute || currentRoute.source === 'recorded' || s.isRefreshingNavigation || !s.userLocation) return

      const probeLocation = s.navigationMatchedLocation ?? s.userLocation
      const progress = analyzeRouteProgress(currentRoute, probeLocation, {
        nearProgressKm: s.navigationProgressKm,
        progressWindowKm: 1.2,
        nearSegmentIndex: s.navigationMatchedSegmentIndex,
        segmentWindow: 220,
      })
      const distM = s.navigationMatchedLocation ? 0 : progress.distanceToRouteM

      // 헤딩 이탈 감지: GPS 방향 vs 매칭된 경로 세그먼트 방향 차이
      let headingDeviation = 0
      const segIdx = progress.matchedSegmentIndex
      const polyline = currentRoute.polyline ?? []
      if (segIdx >= 0 && segIdx < polyline.length - 1 && s.userLocation.heading != null) {
        const p0 = polyline[segIdx]
        const p1 = polyline[segIdx + 1]
        const routeHeading = ((Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI + 360) % 360
        const diff = Math.abs(s.userLocation.heading - routeHeading)
        headingDeviation = diff > 180 ? 360 - diff : diff
      }

      // 방향 이탈(60° 초과 + 30m): 쿨다운 8초로 빠른 재탐색
      // 거리 이탈(180m 초과): 쿨다운 15초
      const isHeadingOff = headingDeviation > 60 && distM != null && distM > 30
      const isDistanceOff = distM != null && distM > 180
      const offRouteReason = isHeadingOff ? 'heading' : isDistanceOff ? 'distance' : null
      const cooldownMs = isHeadingOff ? 8000 : 15000
      const cooldownPassed = Date.now() - s.navigationLastRefreshedAt > cooldownMs

      if (!offRouteReason) {
        offRouteEvidenceRef.current = { count: 0, reason: null }
      }
      if (!cooldownPassed) return

      if (offRouteReason) {
        const prevEvidence = offRouteEvidenceRef.current
        const nextCount = prevEvidence.reason === offRouteReason ? prevEvidence.count + 1 : 1
        offRouteEvidenceRef.current = { count: nextCount, reason: offRouteReason }
        if (nextCount < 2) return
        offRouteEvidenceRef.current = { count: 0, reason: null }

        // TTS 먼저 발화
        if (s.settings?.voiceGuidance !== false) {
          stopActiveAudio()
          if (window.speechSynthesis) window.speechSynthesis.cancel()
          speechQueueRef.current = []
          enqueueSpeech('경로를 다시 탐색합니다')
        }
        s.refreshNavigationRoute('off-route')
      } else if (currentRoute.source !== 'live' && Date.now() - s.navigationLastRefreshedAt > 15000) {
        s.refreshNavigationRoute('live-retry')
      }
    }, 3000)
    return () => window.clearInterval(id)
  }, [isNavigating])

  // 목적지 도착 감지 — 1초마다 체크 (60km/h = 초당 17m, 3초면 50m 이미 지나침)
  useEffect(() => {
    if (!isNavigating) {
      arrivedRef.current = false
      return
    }
    const id = window.setInterval(() => {
      if (arrivedRef.current) return
      const s = useAppStore.getState()
      if (!s.destination || !s.userLocation) return
      const distM = haversineM(s.userLocation.lat, s.userLocation.lng, s.destination.lat, s.destination.lng)
      if (distM > 50) return

      arrivedRef.current = true
      // 시뮬레이션 중이면 정지
      if (s.isDriveSimulation) s.stopDriveSimulation()
      // TTS
      if (s.settings?.voiceGuidance !== false) {
        stopActiveAudio()
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        speechQueueRef.current = []
        enqueueSpeech('목적지에 도착했습니다')
      }
      // 저장 다이얼로그 표시 (drivePathHistory 있으면) 또는 바로 종료
      const movedPolyline = s.drivePathHistory ?? []
      if (movedPolyline.length > 1) {
        setShowSaveDialog(true)
      } else {
        s.stopNavigation()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [isNavigating])

  // 상단 배너: 다음 조작을 목적지보다 우선 표시
  const nextGuidance = nextAction
  const afterNextGuidance = guidanceList.find((action) => action.id !== nextGuidance?.id) ?? null
  const nextGuidanceText = nextGuidance ? getGuidanceInstruction(nextGuidance) : null
  const cleanedInstructionText = stripLaneMention(nextGuidance?.instructionText)
  const afterNextText = afterNextGuidance ? getGuidanceInstruction(afterNextGuidance) : null
  const afterNextGapKm = nextGuidance && afterNextGuidance
    ? Math.max(0, (afterNextGuidance.remainingDistanceKm ?? 0) - (nextGuidance.remainingDistanceKm ?? 0))
    : null
  const bannerTitle = nextGuidance
    ? `${formatGuidanceDistance(nextGuidance.remainingDistanceKm)} 후 ${nextGuidanceText}`
    : destination?.name ?? '목적지'
  const bannerSub = nextGuidance
    ? ([cleanedInstructionText
        ? cleanedInstructionText
        : nextGuidance.afterRoadName
        ? `${nextGuidance.afterRoadName} 진입`
        : `${nextGuidance.afterRoadType === 'highway' ? '고속도로' : '국도'} 진입`,
      afterNextText && Number.isFinite(afterNextGapKm)
        ? `이후 ${formatGuidanceDistance(afterNextGapKm)} 뒤 ${afterNextText}`
        : null].filter(Boolean).join(' · '))
    : `${routeProgress.remainingKm != null ? Number(routeProgress.remainingKm).toFixed(2) : '--'}km · ${remainingEta ? formatEta(remainingEta) : '--'} 소요`
  const bannerLabel = nextGuidance
    ? '다음 안내'
    : '목적지 안내'
  const bannerTurnType = nextGuidance?.turnType ?? 11
  const laneSource = nextGuidance ?? nextMergeOpt ?? null
  const laneGuidance = getLaneGuidance(laneSource)
  const lanePattern = getLanePattern(laneSource)
  const nearbyFuelSummary = nearbyCategory === '주유소' && nearbyPOIs.length > 0
    ? {
        nearbyLowestPoi: [...nearbyPOIs].sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
        routeLowestPoi: nearbyPOIs
          .filter((poi) => poi.isRouteCorridor)
          .sort((a, b) => getDiscountedFuelPrice(a, settings) - getDiscountedFuelPrice(b, settings))[0] ?? null,
      }
    : null

  useEffect(() => {
    if (!isNavigating || !settings.voiceGuidance || startedVoiceRef.current || !window.speechSynthesis) return
    startedVoiceRef.current = true
    enqueueSpeech('안내를 시작합니다.')
  }, [isNavigating, settings.voiceGuidance])

  useEffect(() => {
    if (!isNavigating || !settings.voiceGuidance || !nextGuidance || !window.speechSynthesis) return
    const remainingM = Math.round((nextGuidance.remainingDistanceKm ?? 0) * 1000)
    const threshold = remainingM <= 120 ? '100m' : remainingM <= 350 ? '300m' : remainingM <= 750 ? '700m' : null
    if (!threshold) return

    const key = `${nextGuidance.id}:${threshold}`
    if (spokenGuidanceRef.current.has(key)) return
    spokenGuidanceRef.current.add(key)

    const guidanceText = getGuidanceInstruction(nextGuidance)
    const speech = threshold === '100m'
      ? `100미터 후 ${guidanceText}입니다.`
      : threshold === '300m'
        ? `${Math.max(200, remainingM)}미터 후 ${guidanceText}입니다.`
        : `${Math.max(500, Math.round(remainingM / 10) * 10)}미터 앞 ${guidanceText}입니다.`

    enqueueSpeech(speech)
  }, [isNavigating, nextGuidance, settings.voiceGuidance])

  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const cameras = route?.cameras ?? []

    for (const camera of cameras) {
      if (!hasValidCoordPair(camera?.coord)) continue
      const distanceM = haversineM(userLocation.lat, userLocation.lng, camera.coord[0], camera.coord[1])
      const threshold = distanceM <= 120 ? '100m' : distanceM <= 600 ? '600m' : null
      if (!threshold) continue

      const key = `${camera.id}:${threshold}`
      if (spokenSafetyRef.current.has(key)) continue
      spokenSafetyRef.current.add(key)

      speakAlert(buildCameraAlertSpeech(camera, distanceM, threshold), {
        chimeRepeat: 2,
        flashTone: 'amber',
      })
      break
    }
  }, [isNavigating, route?.cameras, settings.voiceGuidance, userLocation])

  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const nearestHazard = (safetyHazards ?? []).find((hazard) => {
      const distanceM = haversineM(userLocation.lat, userLocation.lng, hazard.lat, hazard.lng)
      return distanceM <= 600
    })
    if (!nearestHazard) return

    const distanceM = haversineM(userLocation.lat, userLocation.lng, nearestHazard.lat, nearestHazard.lng)
    const threshold = distanceM <= 120 ? '100m' : '600m'
    const key = `${nearestHazard.id}:${threshold}`
    if (spokenSafetyRef.current.has(key)) return
    spokenSafetyRef.current.add(key)

    speakAlert(buildHazardAlertSpeech(nearestHazard, distanceM, threshold), {
      chimeRepeat: nearestHazard.type === 'school_zone' ? 2 : 1,
      flashTone: nearestHazard.type === 'school_zone' ? 'amber' : 'sky',
    })
  }, [isNavigating, safetyHazards, settings.voiceGuidance, userLocation])

  if (!isNavigating || showRoutePanel) return null

  async function searchNearby(category) {
    setNearbyCategory(category)
    setNearbyLoading(true)
    try {
      const lat = userLocation?.lat ?? 37.5665
      const lng = userLocation?.lng ?? 126.978
      const pois = await searchNearbyPOIs(category, lat, lng, {
        routePolyline: route?.polyline ?? [],
        fuelSettings: settings,
      })
      setNearbyPOIs(pois.slice(0, 6))
    } catch {
      setNearbyPOIs([])
    }
    setNearbyLoading(false)
  }

  const handleWheelScroll = (e) => {
    if (segmentRef.current) segmentRef.current.scrollLeft += e.deltaY
  }

  const handleStop = () => {
    const movedPolyline = Array.isArray(drivePathHistory) && drivePathHistory.length > 1 ? drivePathHistory : []
    if (movedPolyline.length === 0) {
      saveRoute({ route, destination, forceNoMovement: true })
      stopNavigation()
      return
    }
    const duplicateSavedRoute = savedRoutes.find((savedRoute) =>
      savedRoute.source === 'recorded' && areSimilarPolylines(savedRoute.polyline, movedPolyline)
    )
    if (duplicateSavedRoute) {
      stopNavigation()
      return
    }
    setShowSaveDialog(true)
  }

  async function addPoiAsWaypoint(poi) {
    addWaypoint({ id: `wp-nav-${poi.lat}-${poi.lng}`, name: poi.name, lat: poi.lat, lng: poi.lng, address: poi.address })
    if (destination) await searchRoute(destination)
    setShowNearbyPanel(false)
  }

  const handleRouteSheetTouchStart = (e) => {
    routeSheetTouchHandledRef.current = false
    routeSheetTouchStartRef.current = e.touches?.[0]?.clientY ?? null
  }

  const handleRouteSheetTouchEnd = (e) => {
    const startY = routeSheetTouchStartRef.current
    const endY = e.changedTouches?.[0]?.clientY ?? null
    routeSheetTouchStartRef.current = null
    if (startY == null || endY == null) return

    const deltaY = endY - startY
    if (deltaY <= -28) {
      routeSheetTouchHandledRef.current = true
      setIsRouteSheetCollapsed(false)
    } else if (deltaY >= 36) {
      routeSheetTouchHandledRef.current = true
      setIsRouteSheetCollapsed(true)
    }
  }

  const handleRouteSheetToggle = () => {
    if (routeSheetTouchHandledRef.current) {
      routeSheetTouchHandledRef.current = false
      return
    }
    setIsRouteSheetCollapsed((prev) => !prev)
  }

  const routeSheetPeekTitle = nextMergeOpt?.name ?? '현재 경로 유지'
  const routeSheetPeekMeta = nextMergeOpt
    ? `${Number(nextMergeOpt.remainingDistanceKm ?? nextMergeOpt.distanceFromCurrent).toFixed(2)}km 앞`
    : `${routeProgress.remainingKm != null ? Number(routeProgress.remainingKm).toFixed(2) : '--'}km 남음`
  const nextRouteFuel = upcomingFuelContext?.nextRouteFuel ?? null
  const nextRestFuelStop = upcomingFuelContext?.nextRestFuelStops?.[0] ?? null

  return (
    <>
      {alertFlash && (
        <div
          className={`absolute inset-0 z-40 pointer-events-none ${
            alertFlash === 'red'
              ? 'bg-red-500/18'
              : alertFlash === 'amber'
                ? 'bg-amber-400/14'
                : 'bg-sky-400/14'
          }`}
        />
      )}

      {/* 상단 방향 배너 */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="bg-tmap-blue px-5 pt-14 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <TurnArrow turnType={bannerTurnType} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-sm mb-0.5">{bannerLabel}</div>
              <div className="text-white text-xl font-black truncate">{bannerTitle}</div>
              <div className="text-white/70 text-sm mt-0.5 truncate">{bannerSub}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={openSearchOverlay}
                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
                aria-label="안내 중 경로 검색"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button
                onClick={handleStop}
                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {(nextGuidance || laneGuidance || nextMergeOpt) && (
          <div className="bg-emerald-700 px-5 py-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {lanePattern.map((lane, index) => {
                  const active = lane.startsWith('active')
                  return (
                    <div
                      key={`${lane}-${index}`}
                      className={`w-8 h-10 rounded-lg flex items-center justify-center text-base font-black border ${
                        active
                          ? 'bg-white text-emerald-700 border-white'
                          : 'bg-white/12 text-white/70 border-white/20'
                      }`}
                    >
                      {getLaneArrow(lane)}
                    </div>
                  )
                })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-emerald-100">차선 준비</div>
                <div className="text-sm font-black text-white truncate">
                  {laneGuidance ?? '지금 진행 방향 차로 유지'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 통계 바 */}
        {(() => {
          const currentSpeed = Math.round(userLocation?.speedKmh ?? 0)
          const speedLimit = currentRouteSegment?.speedLimit ?? null
          const overLimit = speedLimit && currentSpeed > speedLimit
          return (
            <div className="bg-white px-5 py-3 flex items-center shadow-md">
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-400">남은시간</div>
                <div className="text-lg font-black text-gray-900">{remainingEta ? formatEta(remainingEta) : '--'}</div>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-400">도착예정</div>
                <div className="text-lg font-black text-gray-900">{getArrivalTime(remainingEta)}</div>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="flex-1 text-center">
                <div className="text-xs text-gray-400">남은거리</div>
                <div className="text-lg font-black text-gray-900">{routeProgress.remainingKm != null ? Number(routeProgress.remainingKm).toFixed(2) : '--'}km</div>
              </div>
              {/* 현재 속도 배지 */}
              <div className={`ml-3 flex flex-col items-center justify-center w-14 h-14 rounded-full border-[3px] ${overLimit ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}>
                <span className={`text-base font-black leading-none ${overLimit ? 'text-red-600' : 'text-gray-900'}`}>{currentSpeed}</span>
                <span className={`text-[9px] leading-tight ${overLimit ? 'text-red-400' : 'text-gray-400'}`}>/{speedLimit ?? '--'}</span>
                <span className="text-[8px] text-gray-400 leading-none">km/h</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 하단 분기점 바 */}
      {isRouteSheetCollapsed && (
        <button
          type="button"
          onClick={() => setIsRouteSheetCollapsed(false)}
          className="absolute bottom-0 left-0 right-0 z-10 h-24 bg-transparent"
          aria-label="하단 경로 패널 펼치기"
        />
      )}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-3 pointer-events-none">
        <div
          className="pointer-events-auto bg-white rounded-2xl shadow-lg overflow-hidden transition-transform duration-300 ease-out"
          style={{ transform: isRouteSheetCollapsed ? 'translateY(calc(100% - 18px))' : 'translateY(0)' }}
          onTouchStart={handleRouteSheetTouchStart}
          onTouchEnd={handleRouteSheetTouchEnd}
        >
          <button
            type="button"
            onClick={handleRouteSheetToggle}
            className={`w-full bg-white/95 active:bg-gray-50 ${isRouteSheetCollapsed ? 'px-4 pt-2 pb-2' : 'px-4 pt-3 pb-3 border-b border-gray-100'}`}
            aria-label={isRouteSheetCollapsed ? '경로 패널 펼치기' : '경로 패널 접기'}
          >
            <div className={`flex justify-center ${isRouteSheetCollapsed ? '' : 'mb-2'}`}>
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {!isRouteSheetCollapsed && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-left">
                  <div className="text-[11px] font-bold text-gray-400">현재 경로 유지</div>
                  <div className="text-sm font-black text-gray-900 truncate">{routeSheetPeekTitle}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[11px] font-semibold text-gray-400">{routeSheetPeekMeta}</div>
                    <div className="text-xs font-bold text-tmap-blue">아래로 밀어 접기</div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7-7 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>

          <div className="px-4 pt-3 pb-2 border-b border-gray-100">
            <div className="text-[11px] font-bold text-gray-400 mb-2">현재 경로 기준</div>
            <div className="flex gap-2">
              {Object.entries(PRESET_INFO).map(([key, info]) => {
                const active = driverPreset === key
                return (
                  <button
                    key={key}
                    onClick={() => setDriverPreset(key)}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                      active ? 'bg-tmap-blue text-white shadow-sm' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {info.icon} {info.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-[11px] font-bold text-gray-400 mb-2">경로상 주유/휴게소</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-orange-50 px-3 py-3">
                <div className="text-[11px] font-bold text-orange-500">다음 경로상 주유소</div>
                <div className="text-sm font-black text-gray-900 mt-1">
                  {nextRouteFuel?.discountedFuelPrice != null
                    ? `${nextRouteFuel.discountedFuelPrice.toLocaleString()}원/L`
                    : nextRouteFuel?.fuelPrice != null
                      ? `${nextRouteFuel.fuelPrice.toLocaleString()}원/L`
                      : '정보없음'}
                </div>
                <div className="text-[11px] text-gray-500 mt-1 truncate">
                  {nextRouteFuel?.name ?? '경로상 주유소 탐색 중'}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {nextRouteFuel?.fuelBenefitApplied
                    ? nextRouteFuel.fuelBenefitLabel
                    : nextRouteFuel?.routeDistanceKm != null ? `${nextRouteFuel.routeDistanceKm.toFixed(1)}km 앞` : '오피넷 기준'}
                </div>
              </div>
              <div className="rounded-2xl bg-green-50 px-3 py-3">
                <div className="text-[11px] font-bold text-green-600">다음 휴게소 유가</div>
                <div className="text-sm font-black text-gray-900 mt-1">
                  {nextRestFuelStop?.fuelStation?.discountedFuelPrice != null
                    ? `${nextRestFuelStop.fuelStation.discountedFuelPrice.toLocaleString()}원/L`
                    : nextRestFuelStop?.fuelStation?.fuelPrice != null
                      ? `${nextRestFuelStop.fuelStation.fuelPrice.toLocaleString()}원/L`
                      : '정보없음'}
                </div>
                <div className="text-[11px] text-gray-500 mt-1 truncate">
                  {nextRestFuelStop?.name ?? '휴게소 탐색 중'}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {nextRestFuelStop?.fuelStation?.fuelBenefitApplied
                    ? nextRestFuelStop.fuelStation.fuelBenefitLabel
                    : nextRestFuelStop?.distanceFromCurrentKm != null
                    ? `${nextRestFuelStop.distanceFromCurrentKm.toFixed(1)}km 앞`
                    : '오피넷 기준'}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[11px] font-bold text-gray-400">경로상 맛집 후보 10km</div>
              <div className="text-[10px] text-gray-400">TMAP 후보 + Google 평점 보강</div>
            </div>
            {restaurantLoading ? (
              <div className="text-xs text-gray-400 py-2">맛집 후보를 찾는 중</div>
            ) : restaurantCandidates.length === 0 ? (
              <div className="text-xs text-gray-400 py-2">경로 주변 10km 내 후보 없음</div>
            ) : (
              <div className="space-y-2">
                {restaurantCandidates.slice(0, 2).map((poi) => (
                  <div key={poi.id} className="rounded-2xl bg-gray-50 px-3 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-gray-900 truncate">{poi.name}</div>
                      <div className="text-[11px] text-gray-500 mt-1 truncate">{formatRestaurantMeta(poi)}</div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {poi.routeDistanceKm != null ? `${poi.routeDistanceKm.toFixed(1)}km 옆` : '경로 인근'}
                        {typeof poi.googleOpenNow === 'boolean' ? ` · ${poi.googleOpenNow ? '영업중' : '영업종료'}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => addPoiAsWaypoint(poi)}
                      className="px-3 py-2 rounded-xl bg-tmap-blue text-white text-xs font-bold flex-shrink-0"
                    >
                      경유
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 active:bg-gray-100"
            onClick={() => setShowMerge(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base flex-shrink-0">🔀</span>
              <div className="text-left min-w-0">
                <div className="text-xs text-gray-500 leading-tight">다음 분기점</div>
                {nextMergeOpt ? (
                  <div className="text-sm font-bold text-gray-900 truncate">
                    {nextMergeOpt.name}
                    <span className="text-xs font-normal text-gray-500 ml-1">
                      ({Number(nextMergeOpt.remainingDistanceKm ?? nextMergeOpt.distanceFromCurrent).toFixed(2)}km 앞)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-500">분기점 없음</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {nextMergeOpt && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${nextMergeOpt.afterRoadType === 'highway' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {nextMergeOpt.afterRoadType === 'highway' ? '고속' : '국도'}
                </span>
              )}
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {liveMergeOptions.length > 0 && (
            <div ref={segmentRef} onWheel={handleWheelScroll} className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-2 snap-x">
              {liveMergeOptions.slice(0, 4).map((opt) => (
                <JunctionChip key={opt.id} opt={opt} onSelect={() => setShowMerge(true)} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 px-4 pb-3">
            {nextCameraInfo && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📷</span>
                <span className="text-xs text-gray-500">
                  다음 카메라 <strong className="text-red-500">{nextCameraInfo.distanceLabel}</strong> 앞
                </span>
              </div>
            )}
            {nextSectionInfo && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🚧</span>
                <span className="text-xs text-gray-500">
                  구간단속 <strong className="text-orange-500">{nextSectionInfo.distanceLabel}</strong> 앞
                </span>
              </div>
            )}
            {isRefreshingNavigation && (
              <div className="ml-auto text-[11px] font-semibold text-tmap-blue">실시간 재탐색 중</div>
            )}
          </div>
        </div>
      </div>

      {showMerge && <MergeOptionsSheet onClose={() => setShowMerge(false)} />}

      {/* 주유소/휴게소/주차장 빠른 추가 */}
      <div className="absolute right-4 z-20 flex flex-col gap-2" style={{ bottom: '380px' }}>
        <button
          onClick={() => { setShowNearbyPanel(true); searchNearby('주유소') }}
          className="w-11 h-11 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center text-base active:scale-95 transition-all"
          title="근처 주유소"
        >
          ⛽
        </button>
        <button
          onClick={() => { setShowNearbyPanel(true); searchNearby('휴게소') }}
          className="w-11 h-11 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center text-base active:scale-95 transition-all"
          title="근처 휴게소"
        >
          🏪
        </button>
        <button
          onClick={() => { setShowNearbyPanel(true); searchNearby('주차장') }}
          className="w-11 h-11 rounded-full bg-slate-600 text-white shadow-lg flex items-center justify-center text-base active:scale-95 transition-all"
          title="근처 주차장"
        >
          🅿️
        </button>
      </div>

      {/* 내 위치로 재중심 버튼 (auto-follow 꺼졌을 때) */}
      {!navAutoFollow && (
        <button
          onClick={() => setNavAutoFollow(true)}
          className="absolute right-4 bottom-48 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border border-gray-200 active:bg-gray-50"
        >
          <svg className="w-6 h-6 text-tmap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
          </svg>
        </button>
      )}

      {/* 주행 시뮬레이터 버튼 — 개발 환경에서만 표시 */}
      {import.meta.env.VITE_SHOW_SIM_CONTROLS === 'true' && (
        <div className="absolute right-4 bottom-64 z-20 flex flex-col gap-1 items-end">
          {isDriveSimulation ? (
            <>
              <button
                onClick={() => triggerDriveSimulationOffRoute(220, 8)}
                className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-bold rounded-full shadow-lg active:bg-amber-600"
              >
                이탈 테스트
              </button>
              <button
                onClick={stopDriveSimulation}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg active:bg-red-600"
              >
                <span className="w-2 h-2 bg-white rounded-sm inline-block" />
                시뮬 정지
              </button>
            </>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => startDriveSimulation(60)}
                className="px-2.5 py-1.5 bg-gray-800 text-white text-[11px] font-bold rounded-full shadow-lg active:bg-gray-700"
              >
                시뮬 60
              </button>
              <button
                onClick={() => startDriveSimulation(100)}
                className="px-2.5 py-1.5 bg-gray-800 text-white text-[11px] font-bold rounded-full shadow-lg active:bg-gray-700"
              >
                100
              </button>
              <button
                onClick={() => startDriveSimulation(200)}
                className="px-2.5 py-1.5 bg-gray-800 text-white text-[11px] font-bold rounded-full shadow-lg active:bg-gray-700"
              >
                200
              </button>
            </div>
          )}
        </div>
      )}

      {/* 경관 구간 진입 토스트 */}
      {scenicToast && (
        <div className={`absolute top-36 left-4 right-4 z-30 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 text-white ${scenicToast.type === 'coastal' ? 'bg-blue-500' : 'bg-green-600'}`}>
          <span className="text-2xl">{scenicToast.emoji}</span>
          <div>
            <div className="text-xs font-medium opacity-80">{scenicToast.type === 'coastal' ? '해안도로 구간 진입' : '산악도로 구간 진입'}</div>
            <div className="text-sm font-black">{scenicToast.name}</div>
          </div>
          <button onClick={() => setScenicToast(null)} className="ml-auto opacity-60">✕</button>
        </div>
      )}

      {/* 경로 저장 다이얼로그 */}
      {showSaveDialog && (
        <SaveRouteDialog
          route={route}
          destination={destination}
          actualDistanceKm={getPolylineDistanceKm(drivePathHistory)}
          onSave={(name) => {
            saveRoute({ route, destination, name })
            setShowSaveDialog(false)
            stopNavigation()
          }}
          onDiscard={() => {
            setShowSaveDialog(false)
            stopNavigation()
          }}
        />
      )}

      {/* 카메라 신고 다이얼로그 */}
      {showCameraReport && (
        <CameraReportDialog
          camera={showCameraReport}
          cameraReports={cameraReports}
          onReport={(type) => {
            reportCamera({ id: showCameraReport.id, coord: showCameraReport.coord, type })
            setShowCameraReport(null)
          }}
          onClose={() => setShowCameraReport(null)}
        />
      )}

      {showNearbyPanel && (
        <>
          <div className="absolute inset-0 bg-black/30 z-40" onClick={() => setShowNearbyPanel(false)} />
          <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="text-sm font-bold text-gray-900">📍 근처 {nearbyCategory} — 경유지로 추가</div>
              <div className="flex gap-2 mt-2">
                {['주유소', '휴게소', '주차장'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => searchNearby(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${nearbyCategory === cat ? 'bg-tmap-blue text-white border-tmap-blue' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {nearbyFuelSummary && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => nearbyFuelSummary.nearbyLowestPoi && addPoiAsWaypoint(nearbyFuelSummary.nearbyLowestPoi)}
                    disabled={!nearbyFuelSummary.nearbyLowestPoi}
                    className="rounded-xl bg-orange-50 px-3 py-2 text-left disabled:opacity-50"
                  >
                    <div className="text-[11px] text-orange-500 font-bold">근방 최저</div>
                    <div className="text-sm font-black text-gray-900">
                      {nearbyFuelSummary.nearbyLowestPoi?.discountedFuelPrice != null
                        ? `${nearbyFuelSummary.nearbyLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                        : '--'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 truncate">
                      {nearbyFuelSummary.nearbyLowestPoi?.name ?? '선택 불가'}
                    </div>
                  </button>
                  <button
                    onClick={() => nearbyFuelSummary.routeLowestPoi && addPoiAsWaypoint(nearbyFuelSummary.routeLowestPoi)}
                    disabled={!nearbyFuelSummary.routeLowestPoi}
                    className="rounded-xl bg-blue-50 px-3 py-2 text-left disabled:opacity-50"
                  >
                    <div className="text-[11px] text-blue-500 font-bold">경로상 최저</div>
                    <div className="text-sm font-black text-gray-900">
                      {nearbyFuelSummary.routeLowestPoi?.discountedFuelPrice != null
                        ? `${nearbyFuelSummary.routeLowestPoi.discountedFuelPrice.toLocaleString()}원/L`
                        : '--'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 truncate">
                      {nearbyFuelSummary.routeLowestPoi?.name ?? '경로상 주유소 없음'}
                    </div>
                  </button>
                </div>
              )}
            </div>
            <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-2">
              {nearbyLoading && <div className="text-center text-sm text-gray-400 py-4">검색 중...</div>}
              {!nearbyLoading && nearbyPOIs.length === 0 && <div className="text-center text-sm text-gray-400 py-4">근처에 없음</div>}
              {nearbyPOIs.map(poi => (
                <div key={poi.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{poi.name}</div>
                    <div className="text-xs text-gray-400">
                      {poi.distanceKm != null ? `${poi.distanceKm.toFixed(1)}km` : ''} {poi.address ?? ''}
                    </div>
                    {nearbyCategory === '주유소' && (
                      <div className="text-[11px] mt-1 flex items-center gap-2">
                        <span className={`font-bold ${poi.fuelPrice != null ? 'text-orange-600' : 'text-gray-500'}`}>
                          {poi.fuelPrice != null
                            ? `${poi.fuelLabel ?? '휘발유'} ${poi.fuelPrice.toLocaleString()}원/L`
                            : '유가 정보 없음'}
                        </span>
                        {poi.discountedFuelPrice != null && poi.fuelBenefitApplied && (
                          <span className="font-bold text-blue-600">
                            할인 적용 {poi.discountedFuelPrice.toLocaleString()}원/L
                          </span>
                        )}
                        {poi.isRouteCorridor && <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">경로상</span>}
                        <span className="text-gray-400">
                          {poi.priceSource === 'opinet' ? (poi.fuelBenefitLabel ?? '오피넷 실유가') : '유가 정보 없음'}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addPoiAsWaypoint(poi)}
                    className="px-3 py-1.5 rounded-xl bg-tmap-blue text-white text-xs font-bold flex-shrink-0"
                  >
                    경유
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 pb-6 pt-2 safe-bottom">
              <button onClick={() => setShowNearbyPanel(false)} className="w-full py-3 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-700">
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── 하위 컴포넌트 ──────────────────────────────────────

function JunctionChip({ opt, onSelect }) {
  const isHighway = opt.afterRoadType === 'highway'
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 rounded-xl px-3 py-2 min-w-[100px] text-left snap-start border ${
        opt.isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-xs">🔀</span>
        <span className={`text-xs font-bold truncate ${opt.isSelected ? 'text-tmap-blue' : 'text-gray-700'}`}>{opt.name}</span>
      </div>
      <div className={`text-xs font-medium ${isHighway ? 'text-blue-600' : 'text-green-600'}`}>
        {isHighway ? '고속' : '국도'} 진입
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {Number(opt.remainingDistanceKm ?? opt.distanceFromCurrent).toFixed(2)}km 앞
        {opt.addedTime > 0 && <span className="ml-1 text-orange-400">+{opt.addedTime}분</span>}
      </div>
    </button>
  )
}

function SaveRouteDialog({ route, destination, actualDistanceKm, onSave, onDiscard }) {
  const [name, setName] = useState(
    destination?.name ? `→ ${destination.name}` : `경로 ${new Date().toLocaleDateString('ko-KR')}`
  )
  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-50" onClick={onDiscard} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-5 pb-8 safe-bottom slide-up">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="text-lg font-black text-gray-900 mb-1">이 경로를 저장할까요?</div>
        <div className="text-sm text-gray-500 mb-4">
          실제 {actualDistanceKm > 0 ? actualDistanceKm.toFixed(2) : (route?.distance != null ? Number(route.distance).toFixed(2) : '--')}km · {route?.eta ? formatEta(route.eta) : '--'} · 통행료 {route?.tollFee ? `${route.tollFee.toLocaleString()}원` : '없음'}
        </div>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-tmap-blue"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="경로 이름"
        />
        <div className="flex gap-3">
          <button onClick={onDiscard} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-sm font-bold text-gray-700">
            저장 안 함
          </button>
          <button onClick={() => onSave(name)} className="flex-1 py-3.5 rounded-2xl bg-tmap-blue text-sm font-bold text-white">
            💾 저장
          </button>
        </div>
      </div>
    </>
  )
}

function CameraReportDialog({ camera, cameraReports, onReport, onClose }) {
  const existingReport = cameraReports.find(r => r.id === camera.id)
  return (
    <>
      <div className="absolute inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-5 pb-8 safe-bottom slide-up">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">📷</span>
          <div>
            <div className="text-base font-black text-gray-900">{camera.label ?? '카메라'}</div>
            <div className="text-xs text-gray-400">
              {Number.isFinite(Number(camera.speedLimit)) && Number(camera.speedLimit) > 0 ? `제한 ${camera.speedLimit}km/h` : '제한속도 정보 없음'}
            </div>
          </div>
        </div>

        {existingReport ? (
          <div className="mt-4 bg-gray-50 rounded-xl p-3 text-sm text-gray-500 text-center">
            이미 신고됨: {existingReport.type === 'off' ? '꺼진 카메라' : '없는 카메라'}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-500 mt-3 mb-4">이 카메라의 상태를 신고하세요</div>
            <div className="flex gap-3">
              <button
                onClick={() => onReport('off')}
                className="flex-1 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-700"
              >
                🟡 꺼진 카메라
              </button>
              <button
                onClick={() => onReport('fake')}
                className="flex-1 py-3 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-600"
              >
                ❌ 없는 카메라
              </button>
            </div>
          </>
        )}
        <button onClick={onClose} className="w-full mt-3 py-3 text-sm text-gray-400">
          닫기
        </button>
      </div>
    </>
  )
}

function SegmentChip({ seg }) {
  const typeStyles = {
    highway: { bg: 'bg-blue-50', text: 'text-tmap-blue', icon: '🛣️' },
    junction: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: '🔀' },
    exit: { bg: 'bg-green-50', text: 'text-tmap-green', icon: '↗️' },
    section: { bg: 'bg-orange-50', text: 'text-tmap-orange', icon: '🚧' },
  }
  const style = typeStyles[seg.type] ?? typeStyles.highway
  return (
    <div className={`flex-shrink-0 rounded-xl px-3 py-2 ${style.bg} min-w-[90px]`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs">{style.icon}</span>
        <span className={`text-xs font-bold ${style.text}`}>{seg.km}km~</span>
      </div>
      <div className="text-xs text-gray-600 font-medium leading-tight">{seg.roadName}</div>
      <div className="flex items-center gap-1 mt-1">
        <div className={`w-1.5 h-1.5 rounded-full ${seg.congestion === 1 ? 'bg-green-400' : seg.congestion === 2 ? 'bg-yellow-400' : 'bg-red-400'}`}/>
        <span className="text-xs text-gray-400">{seg.speedLimit}km/h</span>
      </div>
    </div>
  )
}

function getArrivalTime(minutesFromNow) {
  if (!minutesFromNow) return '--:--'
  const now = new Date()
  now.setMinutes(now.getMinutes() + minutesFromNow)
  return now.toTimeString().slice(0, 5)
}

// TMAP turnType → 방향 화살표 아이콘
function TurnArrow({ turnType }) {
  // 직진(11), 좌회전(12), 우회전(13), 유턴(14), 좌측합류(16), 우측합류(17), 좌분기(18), 우분기(19), IC/JC램프(100+)
  const t = Number(turnType)
  if (t === 12 || t === 16 || t === 18) {
    // 좌회전
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
      </svg>
    )
  }
  if (t === 13 || t === 17 || t === 19 || t >= 100) {
    // 우회전 / IC 램프 (오른쪽 진출)
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16l4-4m0 0l-4-4m4 4H3m5 4v1a3 3 0 003 3h7a3 3 0 003-3V7a3 3 0 00-3-3h-7a3 3 0 00-3 3v1"/>
      </svg>
    )
  }
  if (t === 14) {
    // 유턴
    return (
      <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
      </svg>
    )
  }
  // 기본: 직진
  return (
    <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18"/>
    </svg>
  )
}
