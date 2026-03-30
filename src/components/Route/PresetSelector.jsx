import React from 'react'
import useAppStore from '../../store/appStore'
import { PRESET_INFO } from '../../data/mockData'

export default function PresetSelector() {
  const { driverPreset, setDriverPreset } = useAppStore()

  return (
    <div>
      <div className="text-xs font-semibold text-gray-400 mb-2 tracking-wide">주행 성향</div>
      <div className="flex gap-2">
        {Object.entries(PRESET_INFO).map(([key, info]) => {
          const active = driverPreset === key
          return (
            <button
              key={key}
              onClick={() => setDriverPreset(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active ? 'preset-btn-active shadow-md' : 'preset-btn-inactive'
              }`}
            >
              <div>{info.icon} {info.label}</div>
            </button>
          )
        })}
      </div>
      <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
        {PRESET_INFO[driverPreset].description}
      </div>
    </div>
  )
}
