import { describe, expect, it, vi } from 'vitest'
import {
  captureSiteCoordinates,
  parseGeofenceRadiusMeters,
  SITE_LOCATION_ACCURACY_LIMIT_METERS,
  SITE_LOCATION_CAPTURE_DEADLINE_MS
} from './siteLocation'

const position = (accuracy: number, latitude = -34.603722, longitude = -58.381592) => ({
  coords: { latitude, longitude, accuracy }
} as GeolocationPosition)

describe('captureSiteCoordinates', () => {
  it('makes one fresh high-accuracy request and returns coordinates with reported accuracy', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(8.4)))

    await expect(captureSiteCoordinates({ getCurrentPosition })).resolves.toEqual({
      latitude: -34.603722,
      longitude: -58.381592,
      accuracyMeters: 8.4
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: SITE_LOCATION_CAPTURE_DEADLINE_MS
    })
  })

  it('accepts a reported accuracy of zero and the proposed limit boundary', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(SITE_LOCATION_ACCURACY_LIMIT_METERS)))
    await expect(captureSiteCoordinates({ getCurrentPosition })).resolves.toMatchObject({ accuracyMeters: 25 })

    const zeroAccuracy = vi.fn((success: PositionCallback) => success(position(0)))
    await expect(captureSiteCoordinates({ getCurrentPosition: zeroAccuracy })).resolves.toMatchObject({ accuracyMeters: 0 })
  })

  it('rejects a position above the proposed quality limit without retrying or returning coordinates', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(25.1)))

    await expect(captureSiteCoordinates({ getCurrentPosition })).rejects.toMatchObject({
      kind: 'precision-insufficient',
      message: expect.stringContaining('25.1 m')
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('explains how to fix a denied location permission', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError))

    await expect(captureSiteCoordinates({ getCurrentPosition })).rejects.toMatchObject({
      kind: 'permission-denied',
      message: expect.stringContaining('Habilitá la ubicación para este sitio')
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('reports a browser geolocation timeout distinctly', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 3 } as GeolocationPositionError))

    await expect(captureSiteCoordinates({ getCurrentPosition })).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringContaining('El navegador agotó el tiempo')
    })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('explains when the device cannot determine a position', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 2 } as GeolocationPositionError))

    await expect(captureSiteCoordinates({ getCurrentPosition })).rejects.toMatchObject({
      kind: 'unavailable',
      message: expect.stringContaining('probá al aire libre')
    })
  })

  it('applies a total application deadline while permission is still pending', async () => {
    vi.useFakeTimers()
    try {
      const getCurrentPosition = vi.fn()
      const request = captureSiteCoordinates({ getCurrentPosition })
      const rejected = expect(request).rejects.toMatchObject({
        kind: 'timeout',
        message: expect.stringContaining('incluida la espera del permiso')
      })

      await vi.advanceTimersByTimeAsync(SITE_LOCATION_CAPTURE_DEADLINE_MS)
      await rejected
      expect(getCurrentPosition).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the request and ignores a late browser callback', async () => {
    let lateSuccess: PositionCallback | undefined
    const controller = new AbortController()
    const getCurrentPosition = vi.fn((success: PositionCallback) => { lateSuccess = success })
    const request = captureSiteCoordinates({ getCurrentPosition }, controller.signal)

    controller.abort()
    await expect(request).rejects.toMatchObject({ kind: 'cancelled' })
    lateSuccess?.(position(8))

    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('rejects an insecure LAN origin with an HTTPS action', async () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('window', { isSecureContext: false, location: { hostname: '192.168.100.12' } })

    try {
      await expect(captureSiteCoordinates({ getCurrentPosition })).rejects.toMatchObject({
        kind: 'insecure-context',
        message: expect.stringContaining('Abrí Braja por HTTPS')
      })
      expect(getCurrentPosition).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('explains when the browser does not support geolocation', async () => {
    await expect(captureSiteCoordinates(null)).rejects.toMatchObject({
      kind: 'unsupported',
      message: expect.stringContaining('navegador compatible')
    })
  })

  it('rejects invalid coordinates and invalid accuracy reports', async () => {
    const invalidCoordinates = vi.fn((success: PositionCallback) => success(position(8, 91)))
    await expect(captureSiteCoordinates({ getCurrentPosition: invalidCoordinates })).rejects.toMatchObject({ kind: 'invalid-position' })

    const invalidAccuracy = vi.fn((success: PositionCallback) => success(position(Number.NaN)))
    await expect(captureSiteCoordinates({ getCurrentPosition: invalidAccuracy })).rejects.toMatchObject({ kind: 'invalid-position' })
  })
})

describe('parseGeofenceRadiusMeters', () => {
  it.each(['50', '100', '500'])('accepts %s meters', (value) => {
    expect(parseGeofenceRadiusMeters(value)).toBe(Number(value))
  })

  it.each(['', '49', '501', '50.5', '1e2'])('rejects invalid radius %j', (value) => {
    expect(() => parseGeofenceRadiusMeters(value)).toThrow('número entero entre 50 y 500 metros')
  })
})
