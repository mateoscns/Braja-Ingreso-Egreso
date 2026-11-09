import { useState } from 'react'
import { FormField } from '../../app/ui'
import { ARGENTINE_TIME_ZONES } from './siteZone'

const OTHER = 'other'
const known = (zone: string) => ARGENTINE_TIME_ZONES.some((entry) => entry.zone === zone)

/**
 * The site's hour by province (2026-11-09: the form asked for "la zona por región de la base IANA"). "Otra" opens a text field
 * for a zone outside Argentina, which SitesView still checks with isRegionTimeZone before sending. Whether that field is open is
 * the only state here; the zone itself lives in the container.
 */
export function SiteZoneField({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [other, setOther] = useState(() => !known(value))
  return <>
    <FormField label="Hora del local" hint="Elegí la provincia del local, así las horas se ven como en su reloj.">
      <select value={other ? OTHER : value} onChange={(event) => {
        const chosen = event.target.value
        setOther(chosen === OTHER)
        onChange(chosen === OTHER ? '' : chosen)
      }}>
        {ARGENTINE_TIME_ZONES.map((entry) => <option key={entry.zone} value={entry.zone}>{entry.label}</option>)}
        <option value={OTHER}>Otra (fuera de Argentina)</option>
      </select>
    </FormField>
    {other && <FormField label="Zona horaria de otro país" hint="Escribila como en la lista mundial de zonas, por ejemplo America/Santiago o Europe/Madrid.">
      <input required maxLength={64} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
    </FormField>}
  </>
}
