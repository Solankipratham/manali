/** Fixed IDs shared by the SQL seed and the local (offline) adapter. */
export const TRIP_ID = '00000000-0000-4000-8000-000000000001';
export const TRIP_NAME = 'Manali Trip';

export interface SeedMember {
  id: string;
  name: string;
  /** Avatar accent colour used across the UI. */
  color: string;
}

export const MEMBERS: SeedMember[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Rohit', color: '#0f766e' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Pratham', color: '#0369a1' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Adarsh', color: '#7c3aed' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Neeraj', color: '#b45309' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Prince', color: '#be123c' },
];

export const memberColor = (name: string): string =>
  MEMBERS.find((m) => m.name === name)?.color ?? '#475569';
