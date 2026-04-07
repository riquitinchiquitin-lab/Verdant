import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { TaskModal } from '../components/TaskModal';
import { Task, Plant } from '../types';

const TaskItem: React.FC<{ 
  task: Task; 
  onToggle: (id: string) => void; 
  onDelete: (id: string) => void; 
  onEdit: (task: Task) => void;
  plants: Plant[];
  today: Date;
  can: (action: string, subject?: any) => boolean;
}> = ({ task, onToggle, onDelete, onEdit, plants, today, can }) => {
    const { t, lv } = useLanguage();
    
    const taskDate = new Date(task.date);
    const isOverdue = !task.completed && taskDate < today;
    
    const plantIds = task.plantIds || [];
    const taskPlants = plants.filter(p => plantIds.includes(p.id));

    return (
        <div className={`group flex items-center gap-3 p-2 md:p-3 rounded-2xl border transition-all duration-300 ${task.completed ? 'bg-gray-50/50 dark:bg-slate-900/30 border-gray-100 dark:border-slate-800 opacity-60' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-verdant/50 hover:shadow-lg'}`}>
            <button 
                onClick={() => onToggle(task.id)}
                disabled={!can('complete_tasks')}
                className={`w-5 h-5 md:w-6 md:h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${!can('complete_tasks') ? 'opacity-50 cursor-not-allowed' : ''} ${task.completed ? 'bg-verdant border-verdant' : isOverdue ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-300 hover:border-verdant'}`}
            >
                {task.completed && <svg className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </button>
            
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
                <div className="flex items-center gap-1.5">
                    <h3 className={`font-black text-gray-900 dark:text-white uppercase tracking-tight text-base md:text-lg ${task.completed ? 'line-through text-gray-400' : ''}`}>
                        {lv(task.title)}
                    </h3>
                    {task.recurrence?.type && task.recurrence.type !== 'NONE' && (
                        <span className="text-[8px] md:text-[9px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">
                            {task.recurrence.type}
                        </span>
                    )}
                </div>
                {task.description && (
                    <p className="text-sm md:text-base text-gray-500 dark:text-slate-400 font-medium leading-tight mt-1 line-clamp-2">
                        {lv(task.description as any)}
                    </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                    <p className={`text-xs md:text-sm font-black uppercase tracking-widest ${isOverdue ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'}`}>
                        {taskDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    {taskPlants.length > 0 && (
                        <div className="flex -space-x-1.5">
                            {taskPlants.slice(0, 5).map(p => (
                                <div key={p.id} className="w-4 h-4 md:w-5 md:h-5 rounded-full border border-white dark:border-slate-900 overflow-hidden bg-gray-200 shadow-sm" title={lv(p.nickname)}>
                                    <img src={p.images?.[0]} alt="" className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1">
                {can('manage_tasks') && (
                    <>
                        <button 
                            onClick={() => onEdit(task)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 text-gray-400 md:text-gray-300 hover:text-verdant transition-all transform hover:scale-110 border border-gray-100 dark:border-slate-800 rounded-lg"
                        >
                            <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button 
                            onClick={() => onDelete(task.id)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 text-gray-400 md:text-gray-300 hover:text-red-500 transition-all transform hover:scale-110 border border-gray-100 dark:border-slate-800 rounded-lg"
                        >
                            <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export const TasksView: React.FC = () => {
  const { t, lv } = useLanguage();
  const { user, can } = useAuth();
  const { tasks, addTask, updateTask, deleteTask, toggleTaskCompletion, plants, searchFilter } = usePlants();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');

  const requestNotification = async () => {
    if (typeof Notification !== 'undefined') {
        try {
            const res = await Notification.requestPermission();
            setNotifyPerm(res);
            if (res === 'granted') { 
                new Notification(t('app_name'), { body: t('notifications_enabled') }); 
            }
        } catch (e) {
            console.warn("Notifications restricted.");
        }
    }
  };

  const handleSaveTask = (task: Task) => {
      if (editingTask) {
          updateTask(task.id, task);
      } else {
          addTask(task);
      }
      setIsModalOpen(false);
      setEditingTask(undefined);
  };

  const handleEditTask = (task: Task) => {
      setEditingTask(task);
      setIsModalOpen(true);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingTask(undefined);
  };

  const filteredPlants = useMemo(() => {
    if (!user || !user.houseId) return plants;
    return plants.filter(p => p.houseId === user.houseId);
  }, [plants, user]);

  const filteredTasks = useMemo(() => {
    let base = tasks;
    if (user && user.houseId) {
        base = tasks.filter(task => {
            // If task is associated with plants, filter by those plants' visibility
            if (task.plantIds && task.plantIds.length > 0) {
                return task.plantIds.some(pid => filteredPlants.some(p => p.id === pid));
            }
            // If task is general, filter by task.houseId
            return task.houseId === user.houseId;
        });
    }
    
    // Filter out watering tasks as requested
    base = base.filter(t => t.type !== 'WATER');
    
    const f = searchFilter.toLowerCase();
    if (!f) return base;
    return base.filter(t => (lv(t.title) || '').toLowerCase().includes(f) || (lv(t.description as any) || '').toLowerCase().includes(f));
  }, [tasks, user, filteredPlants, searchFilter, lv]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dueToday = filteredTasks.filter(t => !t.completed && new Date(t.date) <= today);
  const upcoming = filteredTasks.filter(t => !t.completed && new Date(t.date) > today);
  const completed = filteredTasks.filter(t => t.completed);

  return (
    <div className="p-6 md:p-14 max-w-5xl mx-auto space-y-12 pb-32">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 md:gap-6">
            <div>
                <h1 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('menu_tasks')}</h1>
                <p className="text-gray-500 dark:text-slate-400 mt-1.5 md:mt-2 font-bold uppercase tracking-widest text-[10px] md:text-sm">{t('tasks_op_windows')}</p>
            </div>
            <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
                {notifyPerm !== 'granted' && (
                    <button onClick={requestNotification} className="h-10 md:h-14 px-4 md:px-6 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-xl md:rounded-2xl text-gray-400 hover:text-verdant transition-all">
                        <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </button>
                )}
                {can('manage_tasks') && (
                    <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none h-10 md:h-14 px-6 md:px-8 rounded-xl md:rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest text-[10px] md:text-base">
                        + {t('add_task')}
                    </Button>
                )}
            </div>
        </div>

        <div className="space-y-10">
            <section className="space-y-4">
                <h2 className="text-sm md:text-base font-black text-red-500 uppercase tracking-[0.4em] px-2">{t('tasks_due_now')}</h2>
                <div className="flex flex-col gap-3">
                    {dueToday.map(task => <TaskItem key={task.id} task={task} onToggle={toggleTaskCompletion} onDelete={deleteTask} onEdit={handleEditTask} plants={plants} today={today} can={can} />)}
                    {dueToday.length === 0 && <p className="text-gray-300 italic text-[10px] uppercase font-black tracking-widest px-2">{t('tasks_no_urgent')}</p>}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm md:text-base font-black text-blue-500 uppercase tracking-[0.4em] px-2">{t('tasks_upcoming')}</h2>
                <div className="flex flex-col gap-3">
                    {upcoming.map(task => <TaskItem key={task.id} task={task} onToggle={toggleTaskCompletion} onDelete={deleteTask} onEdit={handleEditTask} plants={plants} today={today} can={can} />)}
                </div>
            </section>

            {completed.length > 0 && (
                <section className="space-y-4 opacity-60">
                    <h2 className="text-sm md:text-base font-black text-gray-400 uppercase tracking-[0.4em] px-2">{t('completed')}</h2>
                    <div className="flex flex-col gap-3">
                        {completed.map(task => <TaskItem key={task.id} task={task} onToggle={toggleTaskCompletion} onDelete={deleteTask} onEdit={handleEditTask} plants={plants} today={today} can={can} />)}
                    </div>
                </section>
            )}
        </div>

        {isModalOpen && <TaskModal isOpen={isModalOpen} onClose={handleCloseModal} onSave={handleSaveTask} taskToEdit={editingTask} />}
    </div>
  );
};