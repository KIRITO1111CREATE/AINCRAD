import { useState, useEffect } from 'react';
import { AppData, Habit, Transaction, JournalEntry, Workout, ProfessionalTask, Alarm } from '../types';

const STORAGE_KEY = 'zetrion_data_v1';

const INITIAL_DATA: AppData = {
  habits: [
    { id: '1', name: 'Meditación Matutina', completedDates: [] },
    { id: '2', name: 'Lectura (30 min)', completedDates: [] },
    { id: '3', name: 'Beber 3L de agua', completedDates: [] },
  ],
  transactions: [],
  journal: [],
  workouts: [],
  tasks: [
    { id: '1', title: 'Definir objetivos Q4', status: 'in-progress', priority: 'high' }
  ],
  alarms: [
    { id: '1', time: '08:00', label: 'Inicio de jornada ZÉTRION', active: true },
    { id: '2', time: '22:00', label: 'Desconexión digital', active: false }
  ]
};

export const useData = () => {
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure alarms array exists for users migrating from older version
        if (!parsed.alarms) parsed.alarms = INITIAL_DATA.alarms;
        setData(parsed);
      } catch (e) {
        console.error("Error parsing data", e);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, loaded]);

  const updateHabits = (habits: Habit[]) => setData(prev => ({ ...prev, habits }));
  const updateTransactions = (transactions: Transaction[]) => setData(prev => ({ ...prev, transactions }));
  const updateJournal = (journal: JournalEntry[]) => setData(prev => ({ ...prev, journal }));
  const updateWorkouts = (workouts: Workout[]) => setData(prev => ({ ...prev, workouts }));
  const updateTasks = (tasks: ProfessionalTask[]) => setData(prev => ({ ...prev, tasks }));
  const updateAlarms = (alarms: Alarm[]) => setData(prev => ({ ...prev, alarms }));

  return {
    data,
    updateHabits,
    updateTransactions,
    updateJournal,
    updateWorkouts,
    updateTasks,
    updateAlarms
  };
};