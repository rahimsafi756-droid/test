import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { HomePage } from './pages/Home.tsx';
import { CatalogPage } from './pages/Catalog.tsx';
import { SearchPage } from './pages/Search.tsx';
import { LivePage } from './pages/Live.tsx';
import { ChannelPage } from './pages/Channel.tsx';
import { TitlePage } from './pages/Title.tsx';
import { WatchlistPage } from './pages/Watchlist.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { SourcesPage } from './pages/Sources.tsx';
import { NotFoundPage } from './pages/NotFound.tsx';
import './styles/app.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'filme', element: <CatalogPage kind="movie" key="movie" /> },
      { path: 'serien', element: <CatalogPage kind="series" key="series" /> },
      { path: 'suche', element: <SearchPage /> },
      { path: 'live', element: <LivePage /> },
      { path: 'live/:id', element: <ChannelPage /> },
      { path: 'titel/:id', element: <TitlePage /> },
      { path: 'merkliste', element: <WatchlistPage /> },
      { path: 'einstellungen', element: <SettingsPage /> },
      { path: 'quellen', element: <SourcesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
