import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeScreen } from './components/HomeScreen';
import { OceanExplorer } from './components/OceanExplorer';
import { OceanDive } from './components/OceanDive';

export function App() {
  const [activeView, setActiveView] = useState<'home' | 'explorer' | 'dive'>('home');
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number }>({
    lat: 15.50,
    lng: 88.25,
  });

  const handleExploreProfile = (lat: number, lng: number) => {
    setTargetCoords({ lat, lng });
    setActiveView('dive');
  };

  return (
    <div className="min-h-screen bg-navy-deep text-text-body font-sans antialiased flex">
      {/* App Shell Sidebar */}
      <Sidebar
        activeTab={activeView}
        onSelectTab={(id) => {
          if (id === 'explorer') setActiveView('explorer');
          if (id === 'dive') setActiveView('dive');
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 ml-16 md:ml-64 relative min-h-screen">
        {activeView === 'home' && (
          <HomeScreen onExplore={() => setActiveView('explorer')} />
        )}
        {activeView === 'explorer' && (
          <OceanExplorer onExploreProfile={handleExploreProfile} />
        )}
        {activeView === 'dive' && (
          <OceanDive
            coordinates={targetCoords}
            onBackToExplorer={() => setActiveView('explorer')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
