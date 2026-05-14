'use client'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api'

const HAGLA = { lat: 32.38639, lng: 34.92667 }

interface Props {
    initialQuery?: string
    initialLat?: number | null
    initialLng?: number | null
    onConfirm: (lat: number, lng: number, label: string) => void
    onClose: () => void
}

const libraries: ("places")[] = ["places"];

export function MapPicker({ initialQuery, initialLat, initialLng, onConfirm, onClose }: Props) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries,
        language: 'he',
        region: 'IL'
    })

    const [map, setMap] = useState<google.maps.Map | null>(null)
    const mapRef = useRef<google.maps.Map | null>(null)

    const [lat, setLat] = useState<number>(initialLat ?? HAGLA.lat)
    const [lng, setLng] = useState<number>(initialLng ?? HAGLA.lng)
    const [label, setLabel] = useState('')
    const [query, setQuery] = useState(initialQuery ?? '')
    const [searching, setSearching] = useState(false)
    const [ready, setReady] = useState(false)
    const geocoderRef = useRef<google.maps.Geocoder | null>(null)
    const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map)
        mapRef.current = map
        geocoderRef.current = new window.google.maps.Geocoder()
        setReady(true)

        if (initialQuery && !initialLat) {
            doSearch(initialQuery, map)
        } else {
            reverseGeocode(initialLat ?? HAGLA.lat, initialLng ?? HAGLA.lng)
        }
    }, [initialQuery, initialLat, initialLng])

    const onUnmount = useCallback(function callback() {
        setMap(null)
        mapRef.current = null
    }, [])

    const reverseGeocode = async (lt: number, lg: number) => {
        if (!geocoderRef.current) return
        try {
            const response = await geocoderRef.current.geocode({ location: { lat: lt, lng: lg } })
            if (response.results && response.results.length > 0) {
                const result = response.results[0]
                setLabel(result.formatted_address || `${lt.toFixed(4)}, ${lg.toFixed(4)}`)
            } else {
                setLabel(`${lt.toFixed(4)}, ${lg.toFixed(4)}`)
            }
        } catch {
            setLabel(`${lt.toFixed(4)}, ${lg.toFixed(4)}`)
        }
    }

    const doSearch = async (q: string, m?: google.maps.Map) => {
        if (!q.trim()) return
        const mapToUse = m || map
        if (!mapToUse || !geocoderRef.current) return
        
        setSearching(true)
        try {
            const response = await geocoderRef.current.geocode({ 
                address: q + ', ישראל',
                region: 'IL'
            })
            if (response.results && response.results.length > 0) {
                const result = response.results[0]
                const location = result.geometry.location
                setLat(location.lat())
                setLng(location.lng())
                setLabel(result.formatted_address || q)
                mapToUse.setCenter(location)
                mapToUse.setZoom(16)
            } else {
                alert('לא נמצאה כתובת — נסה להזין בצורה שונה')
            }
        } catch {
            alert('לא נמצאה כתובת — נסה להזין בצורה שונה')
        } finally {
            setSearching(false)
        }
    }

    const onAutocompleteLoad = useCallback((auto: google.maps.places.Autocomplete) => {
        setAutocomplete(auto)
    }, [])

    const onPlaceChanged = useCallback(() => {
        if (autocomplete && mapRef.current) {
            const place = autocomplete.getPlace()
            if (place.geometry && place.geometry.location) {
                const location = place.geometry.location
                setLat(location.lat())
                setLng(location.lng())
                const shortName = place.name || place.formatted_address || ''
                setLabel(shortName)
                setQuery(shortName)
                mapRef.current.setCenter(location)
                mapRef.current.setZoom(16)
            }
        }
    }, [autocomplete])

    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
            { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
            { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
            { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
            { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
            { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
            { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
            { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
            { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
            { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] }
        ]
    }), [])

    if (!isLoaded) return null

    return (
        <div
            className="fixed inset-0 z-[9000] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
        >
            <div
                className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                style={{ width: 680, maxWidth: '95vw', height: 560, maxHeight: '90vh', background: '#0f1d30', border: '1px solid #1e2d45' }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0" style={{ background: '#0a1525' }}>
                    <span className="text-xl">📍</span>
                    <div className="flex-1">
                        <div className="font-black text-sm text-slate-200">בחר מיקום על המפה</div>
                        <div className="text-[11px] text-slate-500">גרור את הסמן למיקום המדויק או לחץ על המפה</div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
                </div>

                {/* Search bar */}
                <div className="flex gap-2 px-4 py-2.5 border-b border-border shrink-0" style={{ background: '#0a1525' }}>
                    <div className="flex-1">
                        <Autocomplete
                            onLoad={onAutocompleteLoad}
                            onPlaceChanged={onPlaceChanged}
                            options={{ componentRestrictions: { country: 'il' } }}
                        >
                            <input
                                className="input w-full text-sm"
                                placeholder="הזן כתובת לחיפוש..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && doSearch(query)}
                                dir="rtl"
                            />
                        </Autocomplete>
                    </div>
                    <button
                        className="btn-primary px-4 py-2 text-sm"
                        onClick={() => doSearch(query)}
                        disabled={searching || !ready}
                    >
                        {searching ? '⏳' : '🔍'}
                    </button>
                </div>

                {/* Map */}
                <div className="flex-1 relative" style={{ minHeight: 0 }}>
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={{ lat, lng }}
                        zoom={initialLat ? 15 : 9}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={mapOptions}
                        onClick={(e) => {
                            if (e.latLng) {
                                const newLat = e.latLng.lat()
                                const newLng = e.latLng.lng()
                                setLat(newLat)
                                setLng(newLng)
                                reverseGeocode(newLat, newLng)
                            }
                        }}
                    >
                        <Marker
                            position={{ lat, lng }}
                            draggable={true}
                            onDragEnd={(e) => {
                                if (e.latLng) {
                                    const newLat = e.latLng.lat()
                                    const newLng = e.latLng.lng()
                                    setLat(newLat)
                                    setLng(newLng)
                                    reverseGeocode(newLat, newLng)
                                }
                            }}
                        />
                    </GoogleMap>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-4 py-3 border-t border-border shrink-0" style={{ background: '#0a1525' }}>
                    <div className="flex-1 min-w-0">
                        {label ? (
                            <div className="text-xs text-slate-300 truncate" dir="rtl">📍 {label}</div>
                        ) : (
                            <div className="text-xs text-slate-600">המתן לטעינת המפה...</div>
                        )}
                        <div className="text-[10px] text-slate-600 mt-0.5">
                            {lat.toFixed(5)}, {lng.toFixed(5)}
                        </div>
                    </div>
                    <button
                        className="btn-ghost text-sm"
                        onClick={onClose}
                    >
                        ביטול
                    </button>
                    <button
                        className="btn-primary text-sm"
                        onClick={() => onConfirm(lat, lng, label || query)}
                        disabled={!ready}
                    >
                        ✅ אשר מיקום
                    </button>
                </div>
            </div>
        </div>
    )
}
