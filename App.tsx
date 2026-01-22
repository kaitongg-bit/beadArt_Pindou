import React, { useState } from 'react';
import { ViewMode } from './types';
import { BrickMe } from './features/BrickMe';

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
        <h1 className="text-xl font-black text-slate-800 tracking-tight ml-2">拼豆<span className="text-blue-600">礼坊</span></h1>
      </div>
      
      {view !== ViewMode.LANDING && (
          <nav className="flex gap-1 bg-slate-100 p-1 rounded-lg">
             <button
                onClick={() => setView(ViewMode.BEADME)}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${view === ViewMode.BEADME ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                图纸设计
            </button>
          </nav>
      )}

      {/* Spacer to keep alignment */}
      <div className="w-4"></div>
    </header>
  );

  // Landing Page Component
  const Landing = () => (
    <div className="h-full flex flex-col items-center justify-center max-w-5xl mx-auto px-6 py-4">
        <div className="flex-1 flex flex-col justify-center w-full">
            <div className="text-center mb-10">
                <h1 className="text-4xl md:text-6xl font-black text-slate-900 mb-6">像素级 <span className="text-blue-600">美好记忆</span></h1>
                <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto">
                    将您喜爱的照片转化为专业的拼豆图纸。
                    简单几步，生成清晰易读的施工图。
                </p>
            </div>

            <div className="flex justify-center w-full">
                {/* Card 1 */}
                <div 
                    onClick={() => setView(ViewMode.BEADME)}
                    className="group cursor-pointer bg-white rounded-3xl p-8 border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all hover:-translate-y-1 w-full md:max-w-md text-center"
                >
                    <div className="w-16 h-16 mx-auto bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 text-3xl">
                        🧩
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">开始设计图纸</h3>
                    <p className="text-slate-500 text-sm">上传照片，自动生成像素风格并导出图纸。</p>
                    <div className="mt-8 flex items-center justify-center gap-2 text-blue-600 font-bold text-lg bg-blue-50 py-3 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        立即制作 <span>→</span>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Footer / Trust */}
        <div className="mt-4 text-center border-t border-slate-100 pt-8 pb-8 w-full max-w-2xl shrink-0">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4">完美适配色系</p>
            <div className="flex justify-center gap-8 opacity-60">
                <span className="font-black text-2xl text-slate-700 tracking-widest">MARD®</span>
            </div>
        </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#FDFDFD] flex flex-col overflow-hidden print:h-auto print:overflow-visible">
      <Header />
      
      <main className="flex-1 overflow-y-auto lg:overflow-hidden print:overflow-visible print:h-auto">
        {view === ViewMode.LANDING && <Landing />}
        
        <div className={`h-full max-w-7xl mx-auto p-4 md:p-6 ${view === ViewMode.LANDING ? 'hidden' : 'block'} print:h-auto`}>
            {view === ViewMode.BEADME && <BrickMe />}
        </div>
      </main>
    </div>
  );
};

export default App;