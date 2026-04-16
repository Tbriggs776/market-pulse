import { useState, useEffect, useRef } from 'react'
import { MapPin, Check, Loader2, Navigation, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAnonymousStore } from '../contexts/AnonymousStoreContext'

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois',
  'Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts',
  'Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
  'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming',
]

export default function StatePicker() {
  const { isAnonymous, profile, updateProfile } = useAuth()
  const { state: anonState, setState: setAnonState } = useAnonymousStore()

  const currentState = isAnonymous ? anonState : (profile?.state || 'Arizona')

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [geoStatus, setGeoStatus] = useState(null) // null | 'locating' | 'error'
  const [geoError, setGeoError] = useState('')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus filter input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  const filteredStates = filter
    ? US_STATES.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
    : US_STATES

  async function applyState(newState) {
    if (newState === currentState) {
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      if (isAnonymous) {
        setAnonState(newState)
      } else {
        await updateProfile({ state: newState })
      }
      setOpen(false)
      setFilter('')
    } catch (err) {
      console.warn('[StatePicker] save failed:', err?.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoStatus('error')
      setGeoError('Geolocation not supported by this browser')
      return
    }
    setGeoStatus('locating')
    setGeoError('')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          // Census Bureau free reverse geocoder
          const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=Public_AR_Current&vintage=Current_Current&layers=States&format=json`
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Geocoder returned ${res.status}`)
          const data = await res.json()
          const stateMatch = data?.result?.geographies?.States?.[0]?.BASENAME
          if (!stateMatch) throw new Error('No state found at coordinates')
          // Map to our list (Census uses same names as US_STATES except DC)
          const resolved = stateMatch === 'District of Columbia' ? 'District of Columbia' : stateMatch
          if (!US_STATES.includes(resolved)) throw new Error(`Unsupported region: ${resolved}`)
          setGeoStatus(null)
          await applyState(resolved)
        } catch (err) {
          setGeoStatus('error')
          setGeoError(err.message || 'Could not resolve location')
        }
      },
      (err) => {
        setGeoStatus('error')
        setGeoError(err.code === 1 ? 'Permission denied' : 'Could not get location')
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border text-xs text-text-secondary hover:text-ivory hover:border-gold-dim transition-colors"
        title="Change state"
      >
        <MapPin className="w-3 h-3" aria-hidden="true" />
        <span>{currentState}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface-elevated border border-border rounded-md shadow-lg z-50 overflow-hidden">
          {/* Header: use my location */}
          <div className="p-2 border-b border-border">
            <button
              onClick={handleUseMyLocation}
              disabled={geoStatus === 'locating' || saving}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-gold hover:bg-gold/10 transition-colors disabled:opacity-50"
            >
              {geoStatus === 'locating' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5" />
              )}
              <span>{geoStatus === 'locating' ? 'Detecting location...' : 'Use my location'}</span>
            </button>
            {geoStatus === 'error' && (
              <div className="flex items-start gap-1.5 mt-1.5 px-2 text-[10px] text-crimson">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{geoError}</span>
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search states..."
              className="input text-xs w-full py-1.5"
            />
          </div>

          {/* State list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredStates.length === 0 && (
              <div className="p-3 text-xs text-text-muted text-center">No match</div>
            )}
            {filteredStates.map((s) => {
              const isSelected = s === currentState
              return (
                <button
                  key={s}
                  onClick={() => applyState(s)}
                  disabled={saving}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${isSelected ? 'bg-gold/10 text-gold' : 'text-text-secondary hover:bg-surface hover:text-ivory'}`}
                >
                  <span>{s}</span>
                  {isSelected && <Check className="w-3 h-3" />}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-border text-[10px] text-text-muted">
            {isAnonymous ? 'Saved for this session' : 'Saved to your profile'}
          </div>
        </div>
      )}
    </div>
  )
}