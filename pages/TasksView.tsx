import React, { useState, useMemo } from 'react';
import { Bell, Plus, Check, Pencil, Trash2, CheckSquare } from 'lucide-react';
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
  const { lv } = useLanguage();

  const taskDate = new Date(task.date);
  const isOverdue = !task.completed && taskDate < today;

  const plantIds = task.plantIds || [];
  const taskPlants = plants.filter(p => plantIds.includes(p.id));

  return (
    <div
      className={`group flex items-start sm:items-center gap-3.5 p-4 rounded-2xl border transition-all duration-200 ${
        task.completed
          ? 'bg-md-surface-container/50 border-md-outline-variant/20 opacity-70'
          : 'm3-card-elevated border-md-outline-variant/30 hover:shadow-md'
      }`}
    >
      <button
        onClick={() => onToggle(task.id)}
        disabled={!can('complete_tasks')}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        className={`mt-0.5 sm:mt-0 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
          !can('complete_tasks') ? 'opacity-50 cursor-not-allowed' : ''
        } ${
          task.completed
            ? 'bg-md-primary border-md-primary text-md-on-primary'
            : isOverdue
              ? 'border-md-error bg-md-error-container/40'
              : 'border-md-outline hover:border-md-primary'
        }`}
      >
        {task.completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={`font-semibold text-sm md:text-base text-md-on-surface leading-snug ${
              task.completed ? 'line-through text-md-on-surface-variant' : ''
            }`}
          >
            {lv(task.title)}
          </h3>
          {task.recurrence?.type && task.recurrence.type !== 'NONE' && (
            <span className="text-[11px] bg-md-tertiary-container text-md-on-tertiary-container px-2 py-0.5 rounded-full font-semibold">
              {task.recurrence.type}
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-xs md:text-sm text-md-on-surface-variant leading-relaxed mt-0.5 line-clamp-2">
            {lv(task.description as any)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5 mt-2">
          <span
            className={`text-xs font-medium ${
              isOverdue ? 'text-md-error font-semibold' : 'text-md-on-surface-variant'
            }`}
          >
            {taskDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          {taskPlants.length > 0 && (
            <div className="flex -space-x-1.5 items-center">
              {taskPlants.slice(0, 5).map(p => (
                <div
                  key={p.id}
                  className="w-5 h-5 rounded-full border border-md-surface overflow-hidden bg-md-primary-container text-md-on-primary-container flex items-center justify-center shadow-xs"
                  title={lv(p.nickname)}
                >
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold">{(lv(p.nickname) || '?')[0]}</span>
                  )}
                </div>
              ))}
              {taskPlants.length > 5 && (
                <span className="pl-2.5 text-[11px] font-medium text-md-on-surface-variant">
                  +{taskPlants.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {can('manage_tasks') && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(task)}
            aria-label="Edit task"
            className="m3-state-layer opacity-100 md:opacity-0 md:group-hover:opacity-100 w-9 h-9 flex items-center justify-center text-md-on-surface-variant hover:text-md-primary rounded-full transition-all"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            aria-label="Delete task"
            className="m3-state-layer opacity-100 md:opacity-0 md:group-hover:opacity-100 w-9 h-9 flex items-center justify-center text-md-on-surface-variant hover:text-md-error rounded-full transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export const TasksView: React.FC = () => {
  const { t, lv } = useLanguage();
  const { user, can } = useAuth();
  const { tasks, addTask, updateTask, deleteTask, toggleTaskCompletion, plants, houses, searchFilter } = usePlants();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [selectedHouseFilter, setSelectedHouseFilter] = useState<'ALL' | 'UNATTRIBUTED' | string>('ALL');
  const [showCompleted, setShowCompleted] = useState(true);
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';

  const requestNotification = async () => {
    if (typeof Notification !== 'undefined') {
      try {
        const res = await Notification.requestPermission();
        setNotifyPerm(res);
        if (res === 'granted') {
          new Notification(t('app_name'), { body: t('notifications_enabled') });
        }
      } catch (e) {
        console.warn('Notifications restricted.');
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
    if (isAdmin) {
      if (selectedHouseFilter === 'UNATTRIBUTED') {
        base = base.filter(task => !task.houseId);
      } else if (selectedHouseFilter !== 'ALL') {
        base = base.filter(task => {
          if (task.plantIds && task.plantIds.length > 0) {
            return task.plantIds.some(pid => plants.some(p => p.id === pid && p.houseId === selectedHouseFilter));
          }
          return task.houseId === selectedHouseFilter;
        });
      }
    } else if (user && user.houseId) {
      base = tasks.filter(task => {
        if (task.plantIds && task.plantIds.length > 0) {
          return task.plantIds.some(pid => filteredPlants.some(p => p.id === pid));
        }
        return task.houseId === user.houseId;
      });
    }

    // Filter out watering tasks as requested
    base = base.filter(t => t.type !== 'WATER');

    const f = searchFilter.toLowerCase();
    if (!f) return base;
    return base.filter(
      t =>
        (lv(t.title) || '').toLowerCase().includes(f) ||
        (lv(t.description as any) || '').toLowerCase().includes(f)
    );
  }, [tasks, user, isAdmin, selectedHouseFilter, plants, filteredPlants, searchFilter, lv]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const endOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const dueToday = filteredTasks.filter(t => !t.completed && new Date(t.date) <= endOfToday);
  const upcoming = filteredTasks.filter(t => !t.completed && new Date(t.date) > endOfToday);
  const completed = filteredTasks.filter(t => t.completed);

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 pb-32 transition-all">
      {/* Header matching Dashboard & InventoryView */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-md-outline-variant/30 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-md-primary-container text-md-on-primary-container rounded-2xl flex items-center justify-center shadow-xs">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-md-on-surface tracking-tight leading-none">
              {t('menu_tasks')}
            </h1>
            <p className="text-xs font-medium text-md-on-surface-variant mt-1">{t('tasks_op_windows')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {isAdmin && (
            <select
              className="h-10 px-4 bg-md-surface-container-high border border-md-outline-variant/60 rounded-full text-xs font-semibold text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30 transition-all min-w-[160px]"
              value={selectedHouseFilter}
              onChange={(e) => setSelectedHouseFilter(e.target.value)}
            >
              <option value="ALL">{t('labels_all_global_properties')}</option>
              <option value="UNATTRIBUTED">{t('lbl_unattributed')}</option>
              {houses.map(h => (
                <option key={h.id} value={h.id}>{lv(h.name)}</option>
              ))}
            </select>
          )}
          {notifyPerm !== 'granted' && (
            <Button
              variant="tonal"
              size="md"
              onClick={requestNotification}
              title={t('notifications_enabled')}
              className="px-3"
            >
              <Bell className="w-4 h-4" />
            </Button>
          )}
          {can('manage_tasks') && (
            <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="w-4 h-4" />
              {t('add_task')}
            </Button>
          )}
        </div>
      </div>

      {/* Primary Two-Column Disposition on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="space-y-3 bg-md-surface-container-low/60 border border-md-outline-variant/25 rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-md-error uppercase tracking-wider">{t('tasks_due_now')}</h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-md-error-container text-md-on-error-container">
              {dueToday.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {dueToday.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggleTaskCompletion}
                onDelete={deleteTask}
                onEdit={handleEditTask}
                plants={plants}
                today={today}
                can={can}
              />
            ))}
            {dueToday.length === 0 && (
              <div className="py-10 text-center bg-md-surface-container-lowest/60 rounded-2xl border border-dashed border-md-outline-variant/40">
                <p className="text-xs font-medium text-md-on-surface-variant">{t('tasks_no_urgent')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 bg-md-surface-container-low/60 border border-md-outline-variant/25 rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-md-primary uppercase tracking-wider">{t('tasks_upcoming')}</h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-md-primary-container text-md-on-primary-container">
              {upcoming.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {upcoming.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggleTaskCompletion}
                onDelete={deleteTask}
                onEdit={handleEditTask}
                plants={plants}
                today={today}
                can={can}
              />
            ))}
            {upcoming.length === 0 && (
              <div className="py-10 text-center bg-md-surface-container-lowest/60 rounded-2xl border border-dashed border-md-outline-variant/40">
                <p className="text-xs font-medium text-md-on-surface-variant">{t('tasks_no_urgent')}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {completed.length > 0 && (
        <section className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => setShowCompleted(prev => !prev)}
            className="flex items-center gap-2.5 px-1 text-left group"
          >
            <h2 className="text-xs font-bold text-md-on-surface-variant uppercase tracking-wider group-hover:text-md-on-surface transition-colors">
              {t('completed')}
            </h2>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-md-surface-container-high text-md-on-surface-variant">
              {completed.length}
            </span>
          </button>
          {showCompleted && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {completed.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={toggleTaskCompletion}
                  onDelete={deleteTask}
                  onEdit={handleEditTask}
                  plants={plants}
                  today={today}
                  can={can}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {isModalOpen && (
        <TaskModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveTask}
          taskToEdit={editingTask}
        />
      )}
    </div>
  );
};