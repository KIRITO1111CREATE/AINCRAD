import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  DollarSign, 
  BookOpen, 
  Dumbbell, 
  Briefcase, 
  Menu, 
  X,
  Plus,
  Trash2,
  Check,
  TrendingUp,
  TrendingDown,
  Calendar,
  Bell,
  Clock,
  Volume2,
  Mic,
  Activity
} from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { useData } from './hooks/useData';
import { Card, Button, Input, Select } from './components/ui';
import { ViewState, Transaction, JournalEntry, Workout, ProfessionalTask, Alarm, AppData } from './types';

// --- AUDIO HELPERS ---

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

// --- VOICE ASSISTANT COMPONENT ---

const VoiceAssistant: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Audio Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);

  const startSession = async () => {
    try {
      setError(null);
      setStatus('connecting');
      setIsActive(true);

      // Initialize API Client
      // Use window.process.env.API_KEY safely
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("No se detectó API Key. Verifica tu configuración.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Eres ZÉTRION, un asistente de organización personal de alto rendimiento. Eres conciso, profesional y motivador. Tu tono es futurista y elegante.',
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
          onopen: () => {
            setStatus('listening');
            console.log("ZÉTRION Live Connected");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setStatus('speaking');
              const ctx = outputContextRef.current;
              if (!ctx) return;

              const audioData = base64ToUint8Array(base64Audio);
              const float32Data = new Float32Array(audioData.length / 2);
              const dataView = new DataView(audioData.buffer);
              
              for (let i = 0; i < float32Data.length; i++) {
                const int16 = dataView.getInt16(i * 2, true);
                float32Data[i] = int16 / 32768.0;
              }

              const buffer = ctx.createBuffer(1, float32Data.length, 24000);
              buffer.getChannelData(0).set(float32Data);

              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              const now = ctx.currentTime;
              const start = Math.max(now, nextStartTimeRef.current);
              source.start(start);
              nextStartTimeRef.current = start + buffer.duration;
              
              source.onended = () => {
                if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                   setStatus('listening');
                }
              };
            }
          },
          onclose: () => {
            console.log("Session closed");
            stopSession();
          },
          onerror: (err) => {
            console.error("Session error:", err);
            setError("Error de conexión");
            stopSession();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

      // Setup Microphone Input
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const inputCtx = inputContextRef.current;
      const source = inputCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcmData);
        
        if (sessionRef.current) {
          sessionRef.current.then(session => {
            session.sendRealtimeInput({
              media: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
              }
            });
          }).catch(err => console.error("Error sending audio:", err));
        }
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Error al iniciar el sistema de voz");
      setStatus('idle');
      // Do not close immediately so user sees error
    }
  };

  const stopSession = () => {
    // Clean up audio resources
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }
    
    // Close Session
    if (sessionRef.current) {
       sessionRef.current.then((s: any) => s.close && s.close()).catch(() => {});
       sessionRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
    nextStartTimeRef.current = 0;
  };

  if (!isActive) {
    return (
      <button 
        onClick={startSession}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-red rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:scale-105 transition-all z-50 text-white"
        title="Hablar con ZÉTRION AI"
      >
        <Mic size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[60] flex flex-col items-center justify-center p-6 animate-fade-in">
      <button 
        onClick={stopSession} 
        className="absolute top-6 right-6 text-brand-muted hover:text-white"
      >
        <X size={32} />
      </button>

      <div className="flex flex-col items-center gap-8">
        {/* Visualizer Orb */}
        <div className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500
          ${status === 'speaking' ? 'animate-breathing bg-brand-red/20' : 'bg-brand-gray/20'}
        `}>
          <div className={`absolute inset-0 rounded-full border-2 border-brand-red/30 ${status === 'listening' ? 'animate-pulse-fast' : ''}`}></div>
          <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-brand-red to-black flex items-center justify-center shadow-inner`}>
             <Activity className={`text-white w-12 h-12 ${status === 'speaking' ? 'animate-bounce' : ''}`} />
          </div>
          
          {/* Status Rings */}
          {status === 'speaking' && (
             <>
               <div className="absolute inset-[-20px] border border-brand-red/20 rounded-full animate-ping opacity-20"></div>
               <div className="absolute inset-[-40px] border border-brand-red/10 rounded-full animate-ping opacity-10 delay-100"></div>
             </>
          )}
        </div>

        <div className="text-center space-y-2">
           <h2 className="text-2xl font-bold text-white tracking-widest">ZÉTRION LIVE</h2>
           <p className="text-brand-muted uppercase text-sm tracking-wider flex items-center justify-center gap-2">
             {status === 'connecting' && 'Conectando Neural Link...'}
             {status === 'listening' && (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Escuchando
                </span>
             )}
             {status === 'speaking' && (
                <span className="flex items-center gap-2">
                   <span className="w-2 h-2 bg-brand-red rounded-full"></span> Procesando
                </span>
             )}
           </p>
        </div>

        {error && (
          <div className="bg-red-900/20 text-red-500 px-4 py-2 rounded border border-red-900/50">
            {error}
          </div>
        )}
        
        <div className="mt-8 flex gap-4">
           <Button variant="secondary" onClick={stopSession} className="rounded-full px-8 py-3">
             Finalizar Sesión
           </Button>
        </div>
      </div>
    </div>
  );
};

// 1. Dashboard View
const DashboardView: React.FC<{ data: ReturnType<typeof useData>['data'] }> = ({ data }) => {
  const today = new Date().toISOString().split('T')[0];
  
  const completedHabitsToday = data.habits.filter(h => h.completedDates.includes(today)).length;
  const totalHabits = data.habits.length;
  
  const totalIncome = data.transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpense = data.transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
  
  const pendingTasks = data.tasks.filter(t => t.status !== 'done').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-brand-red">
          <p className="text-brand-muted text-sm uppercase font-semibold">Hábitos Hoy</p>
          <div className="flex items-end gap-2">
            <h2 className="text-3xl font-bold text-white">{completedHabitsToday}<span className="text-brand-muted text-xl">/{totalHabits}</span></h2>
          </div>
        </Card>
        <Card className="border-l-4 border-l-white">
          <p className="text-brand-muted text-sm uppercase font-semibold">Balance Actual</p>
          <h2 className={`text-3xl font-bold ${(totalIncome - totalExpense) >= 0 ? 'text-green-500' : 'text-brand-red'}`}>
            ${(totalIncome - totalExpense).toLocaleString()}
          </h2>
        </Card>
        <Card className="border-l-4 border-l-brand-red">
          <p className="text-brand-muted text-sm uppercase font-semibold">Tareas Zétrion</p>
          <h2 className="text-3xl font-bold text-white">{pendingTasks} <span className="text-sm font-normal text-brand-muted">pendientes</span></h2>
        </Card>
        <Card className="border-l-4 border-l-white">
          <p className="text-brand-muted text-sm uppercase font-semibold">Último Workout</p>
          <h2 className="text-lg font-bold text-white truncate">
            {data.workouts.length > 0 ? data.workouts[0].name : 'Sin registrar'}
          </h2>
          {data.workouts.length > 0 && <p className="text-xs text-brand-muted">{new Date(data.workouts[0].date).toLocaleDateString()}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Resumen Profesional">
           <div className="space-y-4">
              {data.tasks.slice(0, 3).map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-black rounded-lg border border-brand-gray">
                   <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${task.priority === 'high' ? 'bg-brand-red' : 'bg-brand-white'}`}></div>
                      <span className={task.status === 'done' ? 'line-through text-brand-muted' : 'text-white'}>{task.title}</span>
                   </div>
                   <span className="text-xs text-brand-muted px-2 py-1 bg-brand-gray rounded uppercase">{task.status}</span>
                </div>
              ))}
              {data.tasks.length === 0 && <p className="text-brand-muted text-center py-4">No hay tareas pendientes.</p>}
           </div>
        </Card>
        <Card title="Última Gratitud">
          {data.journal.length > 0 ? (
            <div className="italic text-brand-muted border-l-2 border-brand-gray pl-4 py-2">
              "{data.journal[0].content}"
              <br/>
              <span className="text-xs not-italic mt-2 block text-brand-red">- {new Date(data.journal[0].date).toLocaleDateString()}</span>
            </div>
          ) : (
            <p className="text-brand-muted">Aún no has escrito nada hoy.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

// 2. Habits View
const HabitsView: React.FC<{ data: ReturnType<typeof useData>['data'], updateHabits: any }> = ({ data, updateHabits }) => {
  const [newHabit, setNewHabit] = useState('');
  const today = new Date().toISOString().split('T')[0];

  const addHabit = () => {
    if (!newHabit.trim()) return;
    updateHabits([...data.habits, { id: crypto.randomUUID(), name: newHabit, completedDates: [] }]);
    setNewHabit('');
  };

  const toggleHabit = (id: string) => {
    const updated = data.habits.map(h => {
      if (h.id === id) {
        const isCompleted = h.completedDates.includes(today);
        return {
          ...h,
          completedDates: isCompleted 
            ? h.completedDates.filter(d => d !== today)
            : [...h.completedDates, today]
        };
      }
      return h;
    });
    updateHabits(updated);
  };

  const deleteHabit = (id: string) => {
    updateHabits(data.habits.filter(h => h.id !== id));
  };

  const getStreak = (dates: string[]) => {
    return dates.length;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card title="Rastreador de Hábitos">
        <div className="flex gap-2 mb-6">
          <Input 
            placeholder="Nuevo hábito..." 
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHabit()}
          />
          <Button onClick={addHabit}><Plus size={18} /></Button>
        </div>

        <div className="space-y-3">
          {data.habits.map(habit => {
            const isDone = habit.completedDates.includes(today);
            return (
              <div key={habit.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isDone ? 'bg-brand-gray/30 border-brand-red/50' : 'bg-black border-brand-gray'}`}>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => toggleHabit(habit.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${isDone ? 'bg-brand-red border-brand-red text-white' : 'border-neutral-600 hover:border-brand-red'}`}
                  >
                    {isDone && <Check size={16} />}
                  </button>
                  <div>
                    <h4 className={`font-medium text-lg ${isDone ? 'text-brand-muted line-through' : 'text-white'}`}>{habit.name}</h4>
                    <p className="text-xs text-brand-muted">Total: {getStreak(habit.completedDates)} días completados</p>
                  </div>
                </div>
                <button onClick={() => deleteHabit(habit.id)} className="text-neutral-600 hover:text-brand-red transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
          {data.habits.length === 0 && <p className="text-center text-brand-muted py-8">No tienes hábitos activos.</p>}
        </div>
      </Card>
    </div>
  );
};

// 3. Budget View
const BudgetView: React.FC<{ data: ReturnType<typeof useData>['data'], updateTransactions: any }> = ({ data, updateTransactions }) => {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('General');

  const addTx = () => {
    if (!amount || !desc) return;
    const newTx: Transaction = {
      id: crypto.randomUUID(),
      amount: parseFloat(amount),
      description: desc,
      type,
      category,
      date: new Date().toISOString()
    };
    updateTransactions([newTx, ...data.transactions]);
    setAmount('');
    setDesc('');
  };

  const deleteTx = (id: string) => {
    updateTransactions(data.transactions.filter(t => t.id !== id));
  };

  // Safe category calculation without Recharts dependency
  const expenseCategories = data.transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalExpenses = Object.values(expenseCategories).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Card title="Nueva Transacción">
          <div className="space-y-4">
             <div className="flex gap-2">
                <Button 
                  variant={type === 'income' ? 'primary' : 'secondary'} 
                  onClick={() => setType('income')}
                  className="flex-1"
                >
                  Ingreso
                </Button>
                <Button 
                  variant={type === 'expense' ? 'primary' : 'secondary'} 
                  onClick={() => setType('expense')}
                  className="flex-1"
                >
                  Gasto
                </Button>
             </div>
             <Input placeholder="Monto" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
             <Input placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} />
             <Select 
                options={[
                  {label: 'General', value: 'General'},
                  {label: 'Comida', value: 'Comida'},
                  {label: 'Transporte', value: 'Transporte'},
                  {label: 'Trabajo', value: 'Trabajo'},
                  {label: 'Hogar', value: 'Hogar'},
                  {label: 'Salud', value: 'Salud'},
                ]}
                value={category}
                onChange={e => setCategory(e.target.value)}
             />
             <Button className="w-full" onClick={addTx}>Agregar</Button>
          </div>
        </Card>
        
        {totalExpenses > 0 && (
          <Card title="Desglose de Gastos">
            <div className="space-y-4">
              {Object.entries(expenseCategories).map(([cat, val]: [string, number]) => (
                <div key={cat}>
                   <div className="flex justify-between text-sm text-brand-muted mb-1">
                      <span>{cat}</span>
                      <span className="text-white font-mono">${val.toFixed(2)}</span>
                   </div>
                   <div className="w-full bg-brand-gray h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-brand-red transition-all duration-500" 
                        style={{ width: `${(val / totalExpenses) * 100}%` }}
                      ></div>
                   </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card title="Historial" className="h-full">
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
            {data.transactions.map(tx => (
              <div key={tx.id} className="flex justify-between items-center p-3 bg-black border border-brand-gray rounded-lg hover:border-neutral-600 transition-colors">
                 <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full bg-brand-gray/50 ${tx.type === 'income' ? 'text-green-500' : 'text-brand-red'}`}>
                      {tx.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <div>
                      <p className="font-medium text-white">{tx.description}</p>
                      <p className="text-xs text-brand-muted">{new Date(tx.date).toLocaleDateString()} • {tx.category}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <span className={`font-bold ${tx.type === 'income' ? 'text-green-500' : 'text-white'}`}>
                      {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </span>
                    <button onClick={() => deleteTx(tx.id)} className="text-neutral-600 hover:text-brand-red"><Trash2 size={14} /></button>
                 </div>
              </div>
            ))}
            {data.transactions.length === 0 && <p className="text-center text-brand-muted py-10">No hay transacciones registradas.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
};

// 4. Journal View
const JournalView: React.FC<{ data: ReturnType<typeof useData>['data'], updateJournal: any }> = ({ data, updateJournal }) => {
  const [content, setContent] = useState('');
  
  const addEntry = () => {
    if (!content.trim()) return;
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      content,
      mood: 'grateful',
      date: new Date().toISOString()
    };
    updateJournal([newEntry, ...data.journal]);
    setContent('');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Card title="Diario de Gratitud" className="border-t-4 border-t-brand-red">
        <div className="space-y-4">
          <textarea 
            className="w-full h-32 bg-black border border-brand-gray rounded-lg p-4 text-white focus:outline-none focus:border-brand-red resize-none placeholder-neutral-700"
            placeholder="¿Por qué estás agradecido hoy?"
            value={content}
            onChange={e => setContent(e.target.value)}
          ></textarea>
          <div className="flex justify-end">
            <Button onClick={addEntry}>Guardar Reflexión</Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white pl-1">Entradas Anteriores</h3>
        {data.journal.map(entry => (
          <div key={entry.id} className="bg-brand-dark p-6 rounded-xl border border-brand-gray relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand-white group-hover:bg-brand-red transition-colors"></div>
            <p className="text-brand-muted text-xs mb-2 font-mono uppercase tracking-widest">{new Date(entry.date).toLocaleString()}</p>
            <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
          </div>
        ))}
         {data.journal.length === 0 && <p className="text-center text-brand-muted">Comienza tu viaje de gratitud hoy.</p>}
      </div>
    </div>
  );
};

// 5. Fitness View
const FitnessView: React.FC<{ data: ReturnType<typeof useData>['data'], updateWorkouts: any }> = ({ data, updateWorkouts }) => {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [type, setType] = useState('strength');

  const addWorkout = () => {
    if (!name || !duration) return;
    const newW: Workout = {
      id: crypto.randomUUID(),
      name,
      durationMinutes: parseInt(duration),
      type: type as any,
      date: new Date().toISOString()
    };
    updateWorkouts([newW, ...data.workouts]);
    setName('');
    setDuration('');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
       <div className="md:col-span-1">
          <Card title="Registrar Actividad">
            <div className="space-y-4">
              <Input placeholder="Nombre (ej. Pierna, Running)" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder="Duración (minutos)" type="number" value={duration} onChange={e => setDuration(e.target.value)} />
              <Select 
                options={[
                  { label: 'Fuerza', value: 'strength' },
                  { label: 'Cardio', value: 'cardio' },
                  { label: 'Flexibilidad', value: 'flexibility' },
                  { label: 'Otro', value: 'other' }
                ]}
                value={type}
                onChange={e => setType(e.target.value)}
              />
              <Button className="w-full" onClick={addWorkout}>Registrar</Button>
            </div>
          </Card>
       </div>
       <div className="md:col-span-2">
         <Card title="Bitácora de Entrenamiento">
            <div className="space-y-3">
              {data.workouts.map(w => (
                <div key={w.id} className="flex items-center justify-between p-4 bg-brand-dark rounded-lg border border-brand-gray">
                   <div className="flex items-center gap-4">
                      <div className="bg-brand-gray p-3 rounded-full text-brand-red">
                        <Dumbbell size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-white">{w.name}</h4>
                        <p className="text-xs text-brand-muted capitalize">{w.type} • {new Date(w.date).toLocaleDateString()}</p>
                      </div>
                   </div>
                   <div className="text-xl font-bold text-white">
                      {w.durationMinutes} <span className="text-xs font-normal text-brand-muted">min</span>
                   </div>
                </div>
              ))}
              {data.workouts.length === 0 && <p className="text-center text-brand-muted py-8">Aún no hay entrenamientos registrados.</p>}
            </div>
         </Card>
       </div>
    </div>
  );
};

// 6. Zetrion (Professional) View
const ZetrionView: React.FC<{ data: ReturnType<typeof useData>['data'], updateTasks: any }> = ({ data, updateTasks }) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [priority, setPriority] = useState('medium');

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const newTask: ProfessionalTask = {
      id: crypto.randomUUID(),
      title: taskTitle,
      status: 'todo',
      priority: priority as any
    };
    updateTasks([...data.tasks, newTask]);
    setTaskTitle('');
  };

  const moveTask = (id: string, newStatus: ProfessionalTask['status']) => {
    const updated = data.tasks.map(t => t.id === id ? { ...t, status: newStatus } : t);
    updateTasks(updated);
  };

  const deleteTask = (id: string) => {
    updateTasks(data.tasks.filter(t => t.id !== id));
  }

  const columns: {id: ProfessionalTask['status'], label: string}[] = [
    { id: 'todo', label: 'Por Hacer' },
    { id: 'in-progress', label: 'En Progreso' },
    { id: 'done', label: 'Completado' }
  ];

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      <div className="flex gap-4 mb-6">
        <div className="flex-1 flex gap-2">
          <Input 
            placeholder="Nueva tarea profesional..." 
            value={taskTitle} 
            onChange={e => setTaskTitle(e.target.value)} 
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <Select 
            className="w-32"
            value={priority}
            onChange={e => setPriority(e.target.value)}
            options={[
              { label: 'Baja', value: 'low' },
              { label: 'Media', value: 'medium' },
              { label: 'Alta', value: 'high' }
            ]}
          />
          <Button onClick={addTask}>Añadir</Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
        {columns.map(col => (
          <div key={col.id} className="bg-brand-dark rounded-xl border border-brand-gray flex flex-col h-full">
            <div className="p-4 border-b border-brand-gray flex justify-between items-center bg-black/50">
              <h3 className="font-bold text-white uppercase text-sm tracking-wider">{col.label}</h3>
              <span className="text-xs bg-brand-gray px-2 py-0.5 rounded text-white">
                {data.tasks.filter(t => t.status === col.id).length}
              </span>
            </div>
            <div className="p-3 flex-1 overflow-y-auto space-y-3">
               {data.tasks.filter(t => t.status === col.id).map(task => (
                 <div key={task.id} className="bg-black border border-brand-gray p-4 rounded-lg shadow-sm group hover:border-brand-red/50 transition-all">
                    <div className="flex justify-between items-start mb-2">
                       <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold tracking-tighter
                         ${task.priority === 'high' ? 'bg-red-900/30 text-red-500' : 
                           task.priority === 'medium' ? 'bg-orange-900/30 text-orange-500' : 
                           'bg-blue-900/30 text-blue-500'}`}>
                         {task.priority}
                       </span>
                       <button onClick={() => deleteTask(task.id)} className="text-neutral-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                    </div>
                    <p className="text-white font-medium mb-4">{task.title}</p>
                    <div className="flex justify-between mt-2 pt-2 border-t border-brand-gray/50">
                      {col.id !== 'todo' && <button onClick={() => moveTask(task.id, 'todo')} className="text-xs text-brand-muted hover:text-white">← Todo</button>}
                      {col.id === 'todo' && <button onClick={() => moveTask(task.id, 'in-progress')} className="text-xs text-brand-muted hover:text-white ml-auto">Progreso →</button>}
                      {col.id === 'in-progress' && <button onClick={() => moveTask(task.id, 'done')} className="text-xs text-brand-muted hover:text-white">Done →</button>}
                    </div>
                 </div>
               ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 7. Alarms View
const AlarmsView: React.FC<{ data: ReturnType<typeof useData>['data'], updateAlarms: any }> = ({ data, updateAlarms }) => {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [permStatus, setPermStatus] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      setPermStatus(result);
    }
  };

  const addAlarm = () => {
    if (!time || !label) return;
    const newAlarm: Alarm = {
      id: crypto.randomUUID(),
      time,
      label,
      active: true
    };
    updateAlarms([...(data.alarms || []), newAlarm]);
    setLabel('');
    setTime('');
  };

  const toggleAlarm = (id: string) => {
    updateAlarms((data.alarms || []).map(a => 
      a.id === id ? { ...a, active: !a.active } : a
    ));
  };

  const deleteAlarm = (id: string) => {
    updateAlarms((data.alarms || []).filter(a => a.id !== id));
  };

  // Clock display logic
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center py-8">
        <h2 className="text-6xl font-bold tracking-widest text-white font-mono">
          {currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          <span className="text-2xl text-brand-muted ml-2">{currentTime.getSeconds().toString().padStart(2, '0')}</span>
        </h2>
        <p className="text-brand-muted mt-2 uppercase tracking-widest text-sm">
          {currentTime.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {permStatus !== 'granted' && typeof Notification !== 'undefined' && (
        <div className="bg-brand-gray/30 border border-brand-red/50 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <Volume2 className="text-brand-red" />
            <p>Necesitamos permiso para enviar notificaciones a tu PC.</p>
          </div>
          <Button onClick={requestPermission} size="sm">Activar Notificaciones</Button>
        </div>
      )}

      <Card title="Gestionar Alarmas">
        <div className="flex gap-4 mb-8 items-end">
          <Input 
            label="Hora" 
            type="time" 
            value={time} 
            onChange={e => setTime(e.target.value)} 
            className="w-32"
          />
          <Input 
            label="Etiqueta" 
            placeholder="Ej. Reunión Zétrion, Tomar Agua..." 
            value={label} 
            onChange={e => setLabel(e.target.value)} 
            className="flex-1"
          />
          <Button onClick={addAlarm} className="mb-[2px]"><Plus size={18} /></Button>
        </div>

        <div className="space-y-3">
          {(data.alarms || []).map(alarm => (
            <div key={alarm.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${alarm.active ? 'bg-black border-brand-white/20' : 'bg-brand-dark/50 border-brand-gray/30 opacity-60'}`}>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${alarm.active ? 'text-brand-red bg-brand-red/10' : 'text-brand-muted'}`}>
                    <Clock size={24} />
                  </div>
                  <span className="text-3xl font-mono font-bold text-white tracking-wider">{alarm.time}</span>
                </div>
                <div>
                  <p className="font-medium text-white">{alarm.label}</p>
                  <p className="text-xs text-brand-muted uppercase tracking-wider">{alarm.active ? 'Activa' : 'Inactiva'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                 <button 
                   onClick={() => toggleAlarm(alarm.id)} 
                   className={`w-12 h-6 rounded-full relative transition-colors ${alarm.active ? 'bg-brand-red' : 'bg-brand-gray'}`}
                 >
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${alarm.active ? 'left-7' : 'left-1'}`}></div>
                 </button>
                 <button onClick={() => deleteAlarm(alarm.id)} className="text-neutral-600 hover:text-brand-red transition-colors">
                    <Trash2 size={18} />
                 </button>
              </div>
            </div>
          ))}
          {(data.alarms || []).length === 0 && <p className="text-center text-brand-muted py-6">No tienes alarmas configuradas.</p>}
        </div>
      </Card>
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data, updateHabits, updateTransactions, updateJournal, updateWorkouts, updateTasks, updateAlarms } = useData();

  // Notification Logic
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission === 'default') {
      // Passive check
    }

    const interval = setInterval(() => {
      const now = new Date();
      const currentTimeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      
      const alarms = data.alarms || [];
      const newAlarms = alarms.map(alarm => {
        if (alarm.active && alarm.time === currentTimeStr && alarm.lastTriggered !== currentTimeStr) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('ZÉTRION - Alarma', {
              body: alarm.label,
              icon: 'https://cdn-icons-png.flaticon.com/512/3602/3602145.png',
              silent: false
            });
          }
          return { ...alarm, lastTriggered: currentTimeStr };
        }
        return alarm;
      });
      
      // Only update if changed to avoid renders
      if (JSON.stringify(newAlarms) !== JSON.stringify(alarms)) {
         updateAlarms(newAlarms);
      }
    }, 5000); 

    return () => clearInterval(interval);
  }, [data.alarms, updateAlarms]);


  const navItems: { id: ViewState; label: string; icon: React.FC<any> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'habits', label: 'Hábitos', icon: CheckSquare },
    { id: 'budget', label: 'Finanzas', icon: DollarSign },
    { id: 'journal', label: 'Gratitud', icon: BookOpen },
    { id: 'fitness', label: 'Fitness', icon: Dumbbell },
    { id: 'zetrion', label: 'ZÉTRION', icon: Briefcase },
    { id: 'alarms', label: 'Alarmas', icon: Bell },
  ];

  const renderContent = () => {
    switch (view) {
      case 'dashboard': return <DashboardView data={data} />;
      case 'habits': return <HabitsView data={data} updateHabits={updateHabits} />;
      case 'budget': return <BudgetView data={data} updateTransactions={updateTransactions} />;
      case 'journal': return <JournalView data={data} updateJournal={updateJournal} />;
      case 'fitness': return <FitnessView data={data} updateWorkouts={updateWorkouts} />;
      case 'zetrion': return <ZetrionView data={data} updateTasks={updateTasks} />;
      case 'alarms': return <AlarmsView data={data} updateAlarms={updateAlarms} />;
      default: return <DashboardView data={data} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-black text-white selection:bg-brand-red selection:text-white font-sans">
      
      {/* Mobile Nav Header */}
      <div className="lg:hidden fixed top-0 w-full bg-black/90 backdrop-blur-md border-b border-brand-gray z-50 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-widest text-white">ZÉTRION</h1>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white">
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-black border-r border-brand-gray transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="h-20 flex items-center px-8 border-b border-brand-gray">
             <h1 className="text-2xl font-black tracking-[0.2em] text-white">ZÉTRION</h1>
          </div>

          <nav className="flex-1 px-4 py-8 space-y-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 group
                  ${view === item.id 
                    ? 'bg-brand-red text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]' 
                    : 'text-brand-muted hover:text-white hover:bg-brand-gray'
                  }
                `}
              >
                <item.icon size={20} className={view === item.id ? 'text-white' : 'text-brand-muted group-hover:text-white'} />
                <span className="font-medium tracking-wide">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-brand-gray">
             <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-brand-white text-black flex items-center justify-center font-bold">
                  Z
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Usuario Zétrion</p>
                  <p className="text-xs text-brand-muted">Pro Account</p>
                </div>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 pt-24 lg:pt-10 overflow-x-hidden relative">
        <div className="max-w-7xl mx-auto h-full pb-20 lg:pb-0">
           <header className="mb-8 flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold text-white mb-1 capitalize">{view === 'zetrion' ? 'Espacio Zétrion' : navItems.find(n => n.id === view)?.label}</h2>
                <p className="text-brand-muted text-sm">{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              {view === 'dashboard' && (
                <div className="hidden md:block">
                   <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                     ● Sistema Operativo
                   </span>
                </div>
              )}
           </header>
           
           {renderContent()}
        </div>
      </main>
      
      {/* Voice Assistant Overlay */}
      <VoiceAssistant />

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default App;