import { useCallback, useState } from 'react';
import { MEMBERS } from '../lib/constants';

const KEY = 'tripkhata.activeMember';

/**
 * The "logged in member" for this device — identifies who is recording
 * expenses (Entered By). Persisted so the app remembers the profile.
 */
export function useActiveMember(): [string, (id: string) => void] {
  const [memberId, setMemberId] = useState<string>(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && MEMBERS.some((m) => m.id === saved)) return saved;
    const pratham = MEMBERS.find((m) => m.name === 'Pratham');
    return pratham?.id ?? MEMBERS[0].id;
  });

  const setActive = useCallback((id: string) => {
    localStorage.setItem(KEY, id);
    setMemberId(id);
  }, []);

  return [memberId, setActive];
}
