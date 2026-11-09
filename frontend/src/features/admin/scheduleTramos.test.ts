import { describe, expect, it } from 'vitest'
import {
  computeTramos, draftBlocks, joinNames, nextTramo, offsetsAreComputed, scheduleChips, SCHEDULE_TYPES, tramoHints, tramosFromBlocks, validateManualBlocks
} from './scheduleTramos'

describe('computeTramos: the day of each tramo follows the server rules', () => {
  it('a corrido schedule stays on the same day', () => {
    const result = computeTramos([{ start: '09:00', end: '17:00' }])
    expect(result.valid).toBe(true)
    expect(result.blocks).toEqual([{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }])
  })

  it('a cortado schedule keeps both tramos on the same day', () => {
    const result = computeTramos([{ start: '09:00', end: '13:00' }, { start: '17:00', end: '21:00' }])
    expect(result.valid).toBe(true)
    expect(result.blocks.map((block) => [block.startDayOffset, block.endDayOffset])).toEqual([[0, 0], [0, 0]])
  })

  it('a tramo that ends at or before its start ends the next day', () => {
    expect(computeTramos([{ start: '22:00', end: '06:00' }]).blocks).toEqual([{ startDayOffset: 0, start: '22:00', end: '06:00', endDayOffset: 1 }])
    expect(computeTramos([{ start: '08:00', end: '08:00' }]).blocks[0].endDayOffset).toBe(1)
  })

  it('two night tramos: the second starts the next day after the first ended after midnight', () => {
    const result = computeTramos([{ start: '22:00', end: '02:00' }, { start: '03:00', end: '06:00' }])
    expect(result.valid).toBe(true)
    expect(result.blocks).toEqual([
      { startDayOffset: 0, start: '22:00', end: '02:00', endDayOffset: 1 },
      { startDayOffset: 1, start: '03:00', end: '06:00', endDayOffset: 1 }
    ])
  })

  it('a tramo after midnight that starts before the previous one ended starts the next day', () => {
    const result = computeTramos([{ start: '18:00', end: '23:00' }, { start: '01:00', end: '04:00' }])
    expect(result.valid).toBe(true)
    expect(result.blocks[1]).toEqual({ startDayOffset: 1, start: '01:00', end: '04:00', endDayOffset: 1 })
  })

  it('a tramo that starts before the previous one ended on the same day is an overlap, not the next day', () => {
    const result = computeTramos([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '16:00' }])
    expect(result.valid).toBe(false)
    expect(result.errors[1].start).toBe('El tramo 2 empieza antes de que termine el 1.')
    expect(result.errors[0]).toEqual({})
  })

  it('a tramo that would start two days later is an overlap', () => {
    const result = computeTramos([{ start: '22:00', end: '06:00' }, { start: '05:00', end: '08:00' }])
    expect(result.valid).toBe(false)
    expect(result.errors[1].start).toBe('El tramo 2 empieza antes de que termine el 1.')
  })

  it('a tramo that needs more than one day is an error', () => {
    const result = computeTramos([{ start: '22:00', end: '02:00' }, { start: '03:00', end: '01:00' }])
    expect(result.valid).toBe(false)
    expect(result.errors[1].end).toBe('Un horario no puede pasar del día siguiente.')
  })

  it('asks for the missing times', () => {
    const result = computeTramos([{ start: '', end: '17:00' }, { start: '18:00', end: '' }])
    expect(result.valid).toBe(false)
    expect(result.errors[0].start).toBe('Elegí a qué hora entra.')
    expect(result.errors[1].end).toBe('Elegí a qué hora sale.')
  })

  it('needs one to four tramos', () => {
    expect(computeTramos([]).valid).toBe(false)
    const five = Array.from({ length: 5 }, (_, index) => ({ start: `0${index}:00`, end: `0${index}:30` }))
    expect(computeTramos(five).valid).toBe(false)
  })

  it('accepts the HH:MM:SS times the API returns', () => {
    expect(computeTramos([{ start: '22:00:00', end: '06:00:00' }]).blocks[0].endDayOffset).toBe(1)
  })
})

describe('legacy templates whose offsets were typed by hand', () => {
  it('round-trips a saved template whose offsets the computation reproduces', () => {
    const saved = [{ startDayOffset: 0 as const, start: '22:00:00', end: '06:00:00', endDayOffset: 1 as const }]
    const tramos = tramosFromBlocks(saved)
    expect(tramos).toEqual([{ start: '22:00', end: '06:00' }])
    expect(offsetsAreComputed(saved)).toBe(true)
    expect(draftBlocks(tramos, null).blocks).toEqual([{ startDayOffset: 0, start: '22:00', end: '06:00', endDayOffset: 1 }])
  })

  it('detects offsets the computation would not produce and keeps them as they were', () => {
    // A tramo saved as starting the next day although it could start the same day: the computation would move it.
    const saved = [
      { startDayOffset: 0 as const, start: '09:00', end: '13:00', endDayOffset: 0 as const },
      { startDayOffset: 1 as const, start: '14:00', end: '18:00', endDayOffset: 1 as const }
    ]
    expect(offsetsAreComputed(saved)).toBe(false)
    const manual = saved.map(({ startDayOffset, endDayOffset }) => ({ startDayOffset, endDayOffset }))
    const result = draftBlocks(tramosFromBlocks(saved), manual)
    expect(result.valid).toBe(true)
    expect(result.blocks).toEqual(saved)
  })

  it('validates hand-typed offsets with the server rules', () => {
    expect(validateManualBlocks([{ startDayOffset: 1, start: '09:00', end: '10:00', endDayOffset: 1 }])[0].start).toBe('El primer tramo tiene que empezar el mismo día.')
    expect(validateManualBlocks([{ startDayOffset: 0, start: '10:00', end: '09:00', endDayOffset: 0 }])[0].end).toBe('Tiene que salir después de entrar. Si sale al otro día, elegí «Día siguiente».')
    expect(validateManualBlocks([{ startDayOffset: 0, start: '09:00', end: '10:00', endDayOffset: 1 }, { startDayOffset: 0, start: '11:00', end: '12:00', endDayOffset: 0 }])[1].start)
      .toBe('El tramo 2 empieza antes de que termine el 1.')
  })
})

describe('presentation helpers', () => {
  it('describes the schedule as chips without total hours', () => {
    const { blocks } = computeTramos([{ start: '09:00', end: '13:00' }, { start: '17:00', end: '21:00' }])
    expect(scheduleChips(blocks, 15, 60)).toEqual(['09:00–13:00', '17:00–21:00', 'desayuno hasta 15 min', 'almuerzo hasta 60 min'])
    expect(scheduleChips(computeTramos([{ start: '22:00', end: '06:00' }]).blocks, 0, 30)).toEqual(['22:00–06:00 (sale al día siguiente)', 'sin tiempo para desayunar', 'almuerzo hasta 30 min'])
  })

  it('explains in the hints which times fall on the next day', () => {
    const { blocks } = computeTramos([{ start: '22:00', end: '02:00' }, { start: '03:00', end: '06:00' }])
    expect(tramoHints(blocks[0])).toEqual({ end: 'Sale al día siguiente (02:00).' })
    expect(tramoHints(blocks[1])).toEqual({ start: 'Entra al día siguiente (03:00).', end: 'Sale al día siguiente (06:00).' })
  })

  it('offers the three schedule types with their tramos', () => {
    expect(SCHEDULE_TYPES.map((type) => [type.title, type.tramos])).toEqual([
      ['Corrido', [{ start: '09:00', end: '17:00' }]],
      ['Cortado', [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '21:00' }]],
      ['De noche', [{ start: '22:00', end: '06:00' }]]
    ])
  })

  it('proposes the next tramo one hour after the previous one ends', () => {
    expect(nextTramo({ start: '09:00', end: '13:00' })).toEqual({ start: '14:00', end: '18:00' })
    expect(nextTramo({ start: '18:00', end: '23:30' })).toEqual({ start: '00:30', end: '04:30' })
  })

  it('joins names the Spanish way', () => {
    expect(joinNames(['Ana'])).toBe('Ana')
    expect(joinNames(['Ana', 'Juan'])).toBe('Ana y Juan')
    expect(joinNames(['Ana', 'Juan', 'Pedro'])).toBe('Ana, Juan y Pedro')
  })
})
