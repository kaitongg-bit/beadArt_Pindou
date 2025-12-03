
import React, { useState } from 'react';
import { ViewMode } from './types';
import { BrickMe } from './features/BrickMe';
import { ReliefArt } from './features/ReliefArt';
import { StickerMaker } from './features/StickerMaker';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.LANDING);

  // Common Header
  const Header = () => (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-50 no-print shrink-0">
      <div 
        className="flex items-center gap-2 cursor-pointer" 
        onClick={() => setView(ViewMode.LANDING)}
      >
        {/* Bead Logo */}
        <div className="flex gap-0.5">
            <div className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></div>
            <div className="w-4 h-4 rounded-full bg-blue-500 shadow-sm"></div>
            <div className="w-4 h-4 rounded-full bg-yellow-400 shadow-sm"></div>
        </div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight ml-2">Bead<span className="text-blue-600">Gift</span></h1>
      </div>
      
      {view !== ViewMode.LANDING && (
          <nav className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {[
                { id: ViewMode.BEADME, label: 'Pattern Maker' },
                { id: ViewMode.GALLERY, label: 'Inspiration' },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${view === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    {tab.label}
                </button>
            ))}
          </nav>
      )}

      <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">
        Export PDF
      </button>
    </header>
  );

  // Landing Page Component
  const Landing = () => (
    <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-16">
            <h1 className="text-5xl font-black text-slate-900 mb-6">Pixel Perfect <span className="text-blue-600">Memories</span>.</h1>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
                Turn your favorite photos into professional Perler Bead patterns. 
                AI-enhanced for clean, easy-to-build designs.
            </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Card 1 */}
            <div 
                onClick={() => setView(ViewMode.BEADME)}
                className="group cursor-pointer bg-white rounded-3xl p-8 border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all hover:-translate-y-1"
            >
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 text-3xl">
                    🧩
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Create Pattern</h3>
                <p className="text-slate-500">Upload a photo. Gemini AI will cartoonize it, and we'll generate the exact bead chart for you.</p>
                <div className="mt-6 flex items-center gap-2 text-blue-600 font-bold text-sm">
                    Start Creating <span>→</span>
                </div>
            </div>

             {/* Card 2 */}
             <div 
                onClick={() => setView(ViewMode.GALLERY)}
                className="group cursor-pointer bg-white rounded-3xl p-8 border-2 border-slate-100 hover:border-purple-400 hover:shadow-xl transition-all hover:-translate-y-1"
            >
                <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6 text-3xl">
                    💡
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Bead Gallery</h3>
                <p className="text-slate-500">Explore community patterns and get inspired by pixel art creations.</p>
                <div className="mt-6 flex items-center gap-2 text-purple-600 font-bold text-sm">
                    View Gallery <span>→</span>
                </div>
            </div>
        </div>
        
        {/* Footer / Trust */}
        <div className="mt-20 text-center border-t border-slate-100 pt-10">
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mb-6">Compatible With</p>
            <div className="flex justify-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all">
                <span className="font-black text-xl text-slate-600">Perler®</span>
                <span className="font-black text-xl text-slate-600">Hama®</span>
                <span className="font-black text-xl text-slate-600">Artkal®</span>
            </div>
        </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#FDFDFD] flex flex-col overflow-hidden print:h-auto print:overflow-visible">
      <Header />
      
      {/* 
          CRITICAL FIX: 
          On mobile, main is auto/scroll so content pushes down.
          On desktop (lg), main is hidden/flex so we can use inner scrollable areas.
          On PRINT, height is auto and overflow visible.
      */}
      <main className="flex-1 overflow-y-auto lg:overflow-hidden print:overflow-visible print:h-auto">
        {view === ViewMode.LANDING && <Landing />}
        
        <div className={`h-full max-w-7xl mx-auto p-4 md:p-6 ${view === ViewMode.LANDING ? 'hidden' : 'block'} print:h-auto`}>
            {view === ViewMode.BEADME && <BrickMe />}
            {view === ViewMode.GALLERY && (
                <div className="text-center mt-20">
                    <h2 className="text-2xl font-bold text-slate-700">Gallery Coming Soon</h2>
                    <p className="text-slate-500">Browse thousands of community templates.</p>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;