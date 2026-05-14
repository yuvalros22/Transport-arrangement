'use client'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, Polyline, OverlayView, Marker, Autocomplete } from '@react-google-maps/api'
import type { Route, RouteStop } from '@/types'

const HAGLA = { lat: 32.38639, lng: 34.92667 }

const libraries: ("places")[] = ["places"];

export function MapView({
  routes,
  activeId,
  onSelect,
}: {
  routes: Route[]
  activeId: number | null
  onSelect: (id: number) => void
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
    language: 'he',
    region: 'IL'
  })

  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [openPopupKey, setOpenPopupKey] = useState<string | null>(null)
  
  const mapRef = useRef<google.maps.Map | null>(null)

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map)
    mapRef.current = map
  }, [])

  const onUnmount = useCallback(function callback() {
    setMap(null)
    mapRef.current = null
  }, [])

  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
      {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#263c3f' }]
      },
      {
        featureType: 'poi.park',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b9a76' }]
      },
      {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#38414e' }]
      },
      {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#212a37' }]
      },
      {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9ca5b3' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#746855' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1f2835' }]
      },
      {
        featureType: 'road.highway',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#f3d19c' }]
      },
      {
        featureType: 'transit',
        elementType: 'geometry',
        stylers: [{ color: '#2f3948' }]
      },
      {
        featureType: 'transit.station',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#d59563' }]
      },
      {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#17263c' }]
      },
      {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#515c6d' }]
      },
      {
        featureType: 'water',
        elementType: 'labels.text.stroke',
        stylers: [{ color: '#17263c' }]
      }
    ]
  }), [])

  // ── Fit Bounds ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || routes.length === 0) return

    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend(new window.google.maps.LatLng(HAGLA.lat, HAGLA.lng))

    let hasStops = false
    routes.forEach(route => {
      route.stops.forEach(s => {
        if (s.lat && s.lng) {
          bounds.extend(new window.google.maps.LatLng(s.lat, s.lng))
          hasStops = true
        }
      })
    })

    if (hasStops) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 })
    }
  }, [map, routes])

  // ── Map search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<{ name: string; lat: number; lng: number } | null>(null)

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q || !map) return
    
    const service = new window.google.maps.places.PlacesService(map)
    const request = {
      query: q + ', ישראל',
      fields: ['name', 'geometry', 'formatted_address'],
    }

    service.textSearch(request, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        const place = results[0]
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          const shortName = place.name || place.formatted_address || q
          
          setSearchResult({ name: shortName, lat, lng })
          map.setCenter({ lat, lng })
          map.setZoom(14)
          setOpenPopupKey(`search_result`)
        }
      } else {
        alert('לא נמצאה כתובת — נסה שוב')
      }
    })
  }, [searchQuery, map])

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)

  const onAutocompleteLoad = useCallback((auto: google.maps.places.Autocomplete) => {
    setAutocomplete(auto)
  }, [])

  const onPlaceChanged = useCallback(() => {
    if (autocomplete && mapRef.current) {
      const place = autocomplete.getPlace()
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const shortName = place.name || place.formatted_address || ''
        setSearchResult({ name: shortName, lat, lng })
        setSearchQuery(shortName)
        mapRef.current.setCenter({ lat, lng })
        mapRef.current.setZoom(14)
        setOpenPopupKey(`search_result`)
      }
    }
  }, [autocomplete])

  const clearSearch = () => {
    setSearchResult(null)
    setSearchQuery('')
  }

  // Prepare grouped stops
  const groupedStops = useMemo(() => {
    const groups: Record<string, { route: Route, stops: RouteStop[], first: RouteStop, key: string }> = {}
    
    routes.forEach(route => {
      const valid = route.stops.filter(s => s.lat && s.lng)
      const locationMap = new Map<string, RouteStop[]>()
      
      for (const stop of valid) {
        const key = `${stop.lat!.toFixed(4)},${stop.lng!.toFixed(4)}`
        if (!locationMap.has(key)) locationMap.set(key, [])
        locationMap.get(key)!.push(stop)
      }

      locationMap.forEach((stopsAtLoc, locKey) => {
        const uniqueKey = `route_${route.id}_loc_${locKey}`
        groups[uniqueKey] = {
          route,
          stops: stopsAtLoc,
          first: stopsAtLoc[0],
          key: uniqueKey
        }
      })
    })
    
    return Object.values(groups)
  }, [routes])

  if (loadError) return <div className="p-4 text-red-500">Error loading Google Maps</div>
  if (!isLoaded) return <div className="p-4 text-slate-400">Loading Map...</div>

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={HAGLA}
        zoom={9}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
        onClick={() => setOpenPopupKey(null)}
      >
        {/* Hagla home pin */}
        <OverlayView
          position={HAGLA}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div 
            onClick={() => setOpenPopupKey('hagla')}
            style={{
              transform: 'translate(-50%, -50%)',
              width: '32px', height: '32px', background: '#fff', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '15px', border: '3px solid #f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,.2)',
              cursor: 'pointer'
            }}
          >
            🏠
          </div>
        </OverlayView>

        {openPopupKey === 'hagla' && (
          <OverlayView position={HAGLA} mapPaneName={OverlayView.FLOAT_PANE}>
            <div style={{
              transform: 'translate(-50%, -120%)',
              background: '#0f1d30', border: '1px solid #1e2d45', borderRadius: '8px',
              padding: '8px', color: '#fff', fontFamily: 'Heebo, sans-serif', fontSize: '13px', fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: '120px', textAlign: 'center'
            }}>
              מושב חגלה — בסיס
            </div>
          </OverlayView>
        )}

        {/* Polylines for routes */}
        {routes.map(route => {
          const on = !activeId || route.id === activeId
          const valid = route.stops.filter(s => s.lat && s.lng)
          if (!valid.length) return null

          const pts = [
            HAGLA,
            ...valid.map(s => ({ lat: s.lat!, lng: s.lng! })),
            HAGLA,
          ]

          // Note: Google Maps doesn't have native "dashArray" like Leaflet, we use icons for dashed lines
          const lineSymbol = route.direction === 'דרום' ? {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3
          } : null

          return (
            <Polyline
              key={`poly_${route.id}`}
              path={pts}
              options={{
                strokeColor: route.color,
                strokeOpacity: on ? 0.85 : 0.12,
                strokeWeight: on ? 3.5 : 2,
                clickable: true,
                icons: lineSymbol ? [{
                  icon: lineSymbol,
                  offset: '0',
                  repeat: '10px'
                }] : undefined
              }}
              onClick={() => onSelect(route.id)}
            />
          )
        })}

        {/* Markers for stops */}
        {groupedStops.map(group => {
          const { route, stops, first, key } = group
          const on = !activeId || route.id === activeId
          
          const multi = stops.length > 1
          const totalCartsSite = stops.reduce((a, s) => a + Number(s.carts), 0)
          const orderLabel = `${first.cart_number || ''}`
          const size = 26

          return (
            <div key={key}>
              <OverlayView
                position={{ lat: first.lat!, lng: first.lng! }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div 
                  onClick={(e) => { e.stopPropagation(); setOpenPopupKey(key); onSelect(route.id); }}
                  style={{
                    transform: 'translate(-50%, -50%)',
                    position: 'relative', width: `${size}px`, height: `${size}px`,
                    opacity: on ? 1 : 0.4,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    width: `${size}px`, height: `${size}px`,
                    background: route.color, color: '#fff', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '10px',
                    border: '2px solid rgba(255,255,255,.85)',
                    boxShadow: '0 2px 10px rgba(0,0,0,.5)',
                    fontFamily: 'Heebo, sans-serif'
                  }}>
                    {orderLabel}
                  </div>
                  {multi && (
                    <div style={{
                      position: 'absolute', top: '-4px', left: '-4px',
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: '#fbbf24', color: '#000',
                      fontSize: '8px', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid #000', fontFamily: 'Heebo, sans-serif',
                      lineHeight: 1
                    }}>
                      {stops.length}
                    </div>
                  )}
                </div>
              </OverlayView>

              {openPopupKey === key && (
                <OverlayView
                  position={{ lat: first.lat!, lng: first.lng! }}
                  mapPaneName={OverlayView.FLOAT_PANE}
                >
                  <div style={{
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-20px',
                    background: '#0f1d30', border: '1px solid #1e2d45', borderRadius: '8px',
                    padding: '12px', color: '#fff', fontFamily: 'Heebo, sans-serif',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: '220px', direction: 'rtl',
                    zIndex: 1000
                  }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{first.address}</div>
                    {multi && <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>🏢 {stops.length} לקוחות · 🛒 {totalCartsSite} עגלות</div>}
                    
                    {stops.map((s, idx) => {
                      const warn = s.notes && (s.notes.includes('חובה') || s.notes.includes('מזומן'))
                      return (
                        <div key={idx} style={{ borderTop: idx > 0 ? '1px solid #1e2d45' : 'none', paddingTop: idx > 0 ? '8px' : '0', marginTop: idx > 0 ? '8px' : '0' }}>
                          <div style={{ fontSize: '14px', fontWeight: 800 }}>{s.name}</div>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', margin: '4px 0' }}>
                            {s.carts ? <span style={{ background: `${route.color}22`, color: route.color, padding: '2px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>🛒 {s.carts}</span> : null}
                            {s.time_window ? <span style={{ background: '#3b82f620', color: '#93c5fd', padding: '2px 9px', borderRadius: '12px', fontSize: '11px' }}>⏰ {s.time_window}</span> : null}
                          </div>
                          {s.notes && <div style={{ background: warn ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)', borderRadius: '8px', padding: '5px 8px', fontSize: '11px', color: warn ? '#fca5a5' : '#94a3b8' }}>{s.notes}</div>}
                          <div style={{ marginTop: '4px', fontSize: '10px', color: '#475569' }}>{route.name} · עצירה {s.order}</div>
                        </div>
                      )
                    })}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setOpenPopupKey(null); }}
                      style={{ position: 'absolute', top: '8px', left: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
                    >✕</button>
                  </div>
                </OverlayView>
              )}
            </div>
          )
        })}

        {/* Search result marker */}
        {searchResult && (
          <OverlayView
            position={{ lat: searchResult.lat, lng: searchResult.lng }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div 
              onClick={() => setOpenPopupKey('search_result')}
              style={{
                transform: 'translate(-50%, -50%)',
                position: 'relative', width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', border: '3px solid rgba(255,255,255,.9)',
                boxShadow: '0 0 0 4px rgba(245,158,11,.3),0 4px 16px rgba(0,0,0,.5)',
              }}>🔍</div>
            </div>
          </OverlayView>
        )}

        {searchResult && openPopupKey === 'search_result' && (
          <OverlayView position={{ lat: searchResult.lat, lng: searchResult.lng }} mapPaneName={OverlayView.FLOAT_PANE}>
            <div style={{
              transform: 'translate(-50%, -100%)', marginTop: '-20px',
              fontFamily: 'Heebo,sans-serif', direction: 'rtl', padding: '12px', minWidth: '180px',
              background: '#0f1d30', border: '1px solid #1e2d45', borderRadius: '8px', color: '#fff',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px' }}>🔍 תוצאת חיפוש</div>
              <div style={{ fontSize: '12px', color: '#e2e8f0' }}>{searchResult.name}</div>
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>{searchResult.lat.toFixed(5)}, {searchResult.lng.toFixed(5)}</div>
              <button 
                onClick={(e) => { e.stopPropagation(); setOpenPopupKey(null); }}
                style={{ position: 'absolute', top: '8px', left: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
              >✕</button>
            </div>
          </OverlayView>
        )}

      </GoogleMap>

      {/* ── Floating search bar ── */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex gap-1.5 items-center"
        style={{ width: 'min(400px, 85%)' }}
      >
        <div
          className="flex flex-1 items-center rounded-xl overflow-hidden shadow-xl"
          style={{ background: '#0f1d30cc', backdropFilter: 'blur(8px)', border: '1px solid #1e2d45' }}
        >
          <span className="px-2.5 text-slate-500 text-sm shrink-0">🔍</span>
          <div className="flex-1">
            <Autocomplete
              onLoad={onAutocompleteLoad}
              onPlaceChanged={onPlaceChanged}
              options={{ componentRestrictions: { country: 'il' } }}
            >
              <input
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none py-2 pr-1"
                placeholder="חפש מקום, כתובת, ישוב..."
                value={searchQuery}
                dir="rtl"
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </Autocomplete>
          </div>
          {searchResult && (
            <button
              onClick={clearSearch}
              className="px-2 text-slate-500 hover:text-slate-300 transition-colors text-base shrink-0"
            >✕</button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={!searchQuery.trim()}
          className="shrink-0 py-2 px-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            color: '#000',
            boxShadow: '0 2px 12px rgba(245,158,11,.4)',
          }}
        >
          חפש
        </button>
      </div>

      {/* Search result label (bottom) */}
      {searchResult && (
        <div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{
            background: '#0f1d30dd',
            backdropFilter: 'blur(8px)',
            border: '1px solid #f59e0b40',
            color: '#fbbf24',
            maxWidth: '80%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          📍 {searchResult.name}
        </div>
      )}
    </div>
  )
}
