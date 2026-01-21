export type ViewState = 'dashboard' | 'habits' | 'budget' | 'journal' | 'fitness' | 'zetrion' | 'alarms';

// Habit Tracker Types
export interface Habit {
  id: string;
  name: string;
  completedDates: string[]; // ISO date strings YYYY-MM-DD
  color?: string;
}

// Budget Manager Types
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
}

// Journal Types
export interface JournalEntry {
  id: string;
  content: string;
  mood: 'grateful' | 'neutral' | 'challenged';
  date: string; // ISO string
}

// Fitness Types
export interface Workout {
  id: string;
  name: string;
  durationMinutes: number;
  type: 'cardio' | 'strength' | 'flexibility' | 'other';
  date: string;
  notes?: string;
}

// Zetrion (Professional) Types
export interface ProfessionalTask {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  deadline?: string;
}

// Alarm Types
export interface Alarm {
  id: string;
  time: string; // HH:mm format
  label: string;
  active: boolean;
  lastTriggered?: string; // To prevent multiple alerts in the same minute
}

export interface AppData {
  habits: Habit[];
  transactions: Transaction[];
  journal: JournalEntry[];
  workouts: Workout[];
  tasks: ProfessionalTask[];
  alarms: Alarm[];
}