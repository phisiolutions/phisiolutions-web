// Catálogo de servicios. Precios en euros (céntimos) por sesión.
// Las duraciones son una suposición inicial: ajústalas aquí.

export type Audience = 'pacientes' | 'profesionales';

export interface Service {
  id: string;
  audience: Audience;
  name: string;
  description: string;
  /** null = precio pendiente: se muestra "Próximamente" y no se puede reservar. */
  priceCents: number | null;
  durationMinutes: number;
  highlight?: string;
}

export const SERVICES: Service[] = [
  {
    id: 'pac-informativa',
    audience: 'pacientes',
    name: 'Primera sesión informativa',
    description: 'Valoramos tu caso y te orientamos sobre el tratamiento más adecuado.',
    priceCents: 10000,
    durationMinutes: 60,
  },
  {
    id: 'pac-plan-integral',
    audience: 'pacientes',
    name: 'Plan integral de recuperación funcional',
    description: 'Sesión para elaborar tu plan completo y descarga del dosier ejecutivo.',
    priceCents: 25000,
    durationMinutes: 60,
    highlight: 'Incluye dosier descargable',
  },
  {
    id: 'pac-estudio-informes',
    audience: 'pacientes',
    name: 'Fisioterapia con estudio documental de informes',
    description: 'Sesión de fisioterapia con revisión de tus informes médicos y pruebas.',
    priceCents: 8000,
    durationMinutes: 60,
  },
  {
    id: 'pac-fisio-30',
    audience: 'pacientes',
    name: 'Fisioterapia online 30 min',
    description: 'Sesión guiada por videollamada para tu tratamiento y ejercicios.',
    priceCents: 4000,
    durationMinutes: 30,
  },
  {
    id: 'pac-fisio-60',
    audience: 'pacientes',
    name: 'Fisioterapia online 60 min',
    description: 'Sesión guiada por videollamada para tu tratamiento y ejercicios.',
    priceCents: 5000,
    durationMinutes: 60,
  },
  {
    id: 'pro-informativa',
    audience: 'profesionales',
    name: 'Primera sesión informativa',
    description: 'Revisamos tu proyecto, la modalidad que mejor encaja y los siguientes pasos.',
    priceCents: 10000,
    durationMinutes: 60,
  },
  {
    id: 'pro-plan-negocio',
    audience: 'profesionales',
    name: 'Plan de negocio',
    description:
      'Desarrollo completo del plan con viabilidad, requisitos legales y normativa, y descarga del dosier ejecutivo.',
    priceCents: 100000,
    durationMinutes: 60,
  },
  {
    id: 'pro-plan-asesoria',
    audience: 'profesionales',
    name: 'Plan de negocio + asesoría',
    description: 'Plan de negocio con dosier ejecutivo y 3 sesiones online de asesoría para ponerlo en marcha.',
    priceCents: 150000,
    durationMinutes: 60,
    highlight: 'El más completo',
  },
  {
    id: 'pro-formacion',
    audience: 'profesionales',
    name: 'Mejora tus resultados',
    description:
      'Si ya eres profesional y quieres mejorar en resultados, te asesoramos sobre las principales demandas o carencias del mercado y cómo formarte en ellas.',
    priceCents: null,
    durationMinutes: 60,
  },
  {
    id: 'pro-marketing',
    audience: 'profesionales',
    name: 'Date a conocer',
    description: 'Estudio de marketing y de posicionamiento en la web y en redes sociales para darte a conocer.',
    priceCents: null,
    durationMinutes: 60,
  },
  {
    id: 'pro-crecimiento',
    audience: 'profesionales',
    name: 'Haz crecer tu negocio',
    description: 'Cuéntanos tu caso y buscaremos las mejores opciones para incrementar tu volumen de negocio.',
    priceCents: null,
    durationMinutes: 60,
  },
  {
    id: 'pro-regalo',
    audience: 'profesionales',
    name: 'Regala un estudio de negocio',
    description: 'Regala un estudio de planificación o de mejora de negocio con nosotros.',
    priceCents: null,
    durationMinutes: 60,
    highlight: 'Para regalar',
  },
];

export const MAX_QUANTITY = 10;

export function isBookable(s: Service): s is Service & { priceCents: number } {
  return s.priceCents !== null;
}

export function getService(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function formatEuros(cents: number | null): string {
  if (cents === null) return 'Próximamente';
  const euros = cents / 100;
  const whole = Number.isInteger(euros);
  const [int, dec] = euros.toFixed(whole ? 0 : 2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (dec ? `${grouped},${dec}` : grouped) + ' €';
}
