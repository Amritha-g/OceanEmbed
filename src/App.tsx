import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeScreen } from './components/HomeScreen';
import { OceanExplorerPlaceholder } from './components/OceanExplorerPlaceholder';

export function App() {
  const [activeView, setActiveView] = useState<'home' | 'explorer'>('home');

  return (
    <div className="min-h-screen bg-navy-deep text-text-body font-sans antialiased flex">
      {/* App Shell Sidebar */}
      <Sidebar
        activeTab={activeView === 'explorer' ? 'explorer' : ''}
        onSelectTab={(id) => {
          if (id === 'explorer') {
            setActiveView('explorer');
          }
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 ml-16 md:ml-64 relative min-h-screen">
        {activeView === 'home' ? (
          <HomeScreen onExplore={() => setActiveView('explorer')} />
        ) : (
          <OceanExplorerPlaceholder />
        )}
      </main>
    </div>
  );
}

export default App;
