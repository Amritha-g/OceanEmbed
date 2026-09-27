import { useState } from 'react';
import { Navbar, ViewType } from './components/Navbar';
import { HomeScreen } from './components/HomeScreen';
import { OceanExplorer } from './components/OceanExplorer';
import { OceanDive } from './components/OceanDive';
import { Reconstruction } from './components/Reconstruction';
import { TruthCheck } from './components/TruthCheck';
import { OceanIntelligence } from './components/OceanIntelligence';

export function App() {
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number }>({
    lat: 15.50,
    lng: 88.50,
  });

  const handleExploreProfile = (lat: number, lng: number) => {
    setTargetCoords({ lat, lng });
    setActiveView('dive');
  };

  const handleNavigateTo = (view: ViewType, coords?: { lat: number; lng: number }) => {
    if (coords) {
      setTargetCoords(coords);
    }
    setActiveView(view);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 font-sans antialiased flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* ── Single Top Mission Commander Header Bar (No left navbar) ── */}
      <Navbar
        activeView={activeView}
        onSelectView={(view) => setActiveView(view)}
        coordinates={targetCoords}
      />

      {/* ── 100% Fullscreen Immersive Main Workspace ── */}
      <main className="flex-1 relative w-full flex flex-col">
        {activeView === 'home' && (
          <HomeScreen
            onExplore={() => setActiveView('explorer')}
            onSelectView={(view) => setActiveView(view)}
          />
        )}
        {activeView === 'explorer' && (
          <OceanExplorer
            onExploreProfile={handleExploreProfile}
            onNavigateTo={handleNavigateTo}
          />
        )}
        {activeView === 'dive' && (
          <OceanDive
            coordinates={targetCoords}
            onBackToExplorer={() => setActiveView('explorer')}
            onNavigateTo={handleNavigateTo}
          />
        )}
        {activeView === 'reconstruction' && (
          <Reconstruction
            coordinates={targetCoords}
            onBackToExplorer={() => setActiveView('explorer')}
            onExploreDive={() => setActiveView('dive')}
          />
        )}
        {activeView === 'truth-check' && (
          <TruthCheck
            coordinates={targetCoords}
            onBackToExplorer={() => setActiveView('explorer')}
            onNavigateTo={handleNavigateTo}
          />
        )}
        {activeView === 'intelligence' && (
          <OceanIntelligence
            coordinates={targetCoords}
            onBackToExplorer={() => setActiveView('explorer')}
            onNavigateTo={handleNavigateTo}
          />
        )}
      </main>
    </div>
  );
}

export default App;
