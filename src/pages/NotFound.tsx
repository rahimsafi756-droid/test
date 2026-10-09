import { Link } from 'react-router';
import { Empty } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <div className="page page-pad">
      <Empty title="Seite nicht gefunden">
        <Link className="btn" to="/">Zur Startseite</Link>
      </Empty>
    </div>
  );
}
