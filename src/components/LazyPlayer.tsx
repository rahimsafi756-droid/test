import { lazy, Suspense, type ComponentProps } from 'react';
import { Loading } from './ui.tsx';

// hls.js ist gross – erst laden, wenn wirklich etwas abgespielt wird
const Inner = lazy(() => import('./Player.tsx').then((m) => ({ default: m.Player })));

export function Player(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<Loading label="Player wird geladen …" />}>
      <Inner {...props} />
    </Suspense>
  );
}
