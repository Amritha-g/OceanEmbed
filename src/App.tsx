import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeScreen } from './components/HomeScreen';
import { OceanExplorer } from './components/OceanExplorer';
import { OceanDive } from './components/OceanDive';
import { TruthCheck } from './components/TruthCheck';
import { OceanIntelligence } from './components/OceanIntelligence';

export type ActiveRegion = 'bob' | 'as';

export function App() {
  const [activeView, setActiveView] = useState<'home' | 'explorer' | 'dive' | 'truth-check' | 'intelligence'>('home');
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number }>({ lat: 15.50, lng: 88.25 });
  const [activeRegion, setActiveRegion] = useState<ActiveRegion>('bob');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleExploreProfile = (lat: number, lng: number) => {
    setTargetCoords({ lat, lng });
    setActiveView('dive');
  };

  const sidebarW = sidebarOpen ? 'md:ml-64 ml-0' : 'ml-0';

  return (
    <div className="min-h-screen bg-navy-deep text-text-body font-sans antialiased flex">
      <Sidebar
        activeTab={activeView}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        onSelectTab={(id) => {
          if (id === 'explorer') setActiveView('explorer');
          if (id === 'dive') setActiveView('dive');
          if (id === 'truth-check') setActiveView('truth-check');
          if (id === 'intelligence') setActiveView('intelligence');
        }}
      />

      {/* Main Content — shifts based on sidebar width */}
      <main className={`flex-1 relative min-h-screen transition-all duration-300 ${sidebarW}`}>
        {activeView === 'home' && (
          <HomeScreen onExplore={() => setActiveView('explorer')} />
        )}
        {activeView === 'explorer' && (
          <OceanExplorer
            onExploreProfile={handleExploreProfile}
            onRegionChange={setActiveRegion}
            initialRegion={activeRegion}
          />
        )}
        {activeView === 'dive' && (
          <OceanDive
            coordinates={targetCoords}
            region={activeRegion}
            onBackToExplorer={() => setActiveView('explorer')}
          />
        )}
        {activeView === 'truth-check' && (
          <TruthCheck
            coordinates={targetCoords}
            region={activeRegion}
            onBackToExplorer={() => setActiveView('explorer')}
          />
        )}
        {activeView === 'intelligence' && (
          <OceanIntelligence
            coordinates={targetCoords}
            region={activeRegion}
            onBackToExplorer={() => setActiveView('explorer')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
