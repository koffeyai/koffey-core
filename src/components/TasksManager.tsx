import React, { useState, useEffect, useCallback } from 'react';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Edit, Trash2, CheckSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/hooks/use-toast';
import { usePageContextSync } from '@/hooks/usePageContextSync';

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  completed: boolean | null;
  created_at: string;
}

const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_STATUSES = ['open', 'in-progress', 'completed', 'cancelled'];

export const TasksManager = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'open',
    due_date: '',
    completed: false
  });

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch tasks', variant: 'destructive' });
    } else {
      setTasks(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const taskData = {
      ...formData,
      due_date: formData.due_date || null,
      user_id: user.id
    };

    if (editingTask) {
      const { error } = await supabase
        .from('tasks')
        .update(taskData)
        .eq('id', editingTask.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Task updated successfully' });
        fetchTasks();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('tasks')
        .insert([taskData]);

      if (error) {
        toast({ title: 'Error', description: 'Failed to create task', variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Task created successfully' });
        fetchTasks();
        resetForm();
      }
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'medium',
      status: task.status || 'open',
      due_date: task.due_date || '',
      completed: task.completed || false
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete task', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Task deleted successfully' });
      fetchTasks();
    }
  };

  const toggleCompleted = async (id: string, completed: boolean) => {
    const newStatus = !completed ? 'completed' : 'open';
    const { error } = await supabase
      .from('tasks')
      .update({ 
        completed: !completed,
        status: newStatus
      })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update task status', variant: 'destructive' });
    } else {
      fetchTasks();
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      status: 'open',
      due_date: '',
      completed: false
    });
    setEditingTask(null);
    setIsDialogOpen(false);
  };

  const filteredTasks = tasks.filter(task =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.priority?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sync visible tasks to ChatContext for AI page-awareness (debounced)
  const getTaskName = useCallback((task: Task) => task.title || 'Untitled Task', []);
  usePageContextSync({
    entityType: 'tasks',
    entities: filteredTasks,
    getEntityName: getTaskName,
    searchTerm,
  });

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'in-progress': return 'text-blue-600';
      case 'cancelled': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'Add New Task'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Task Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="completed"
                  checked={formData.completed}
                  onCheckedChange={(checked) => setFormData({ ...formData, completed: checked as boolean })}
                />
                <Label htmlFor="completed">Mark as completed</Label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit">{editingTask ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckSquare className="h-5 w-5 mr-2" />
            All Tasks ({filteredTasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell>
                    <span className={`capitalize ${getPriorityColor(task.priority)}`}>
                      {task.priority || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`capitalize ${getStatusColor(task.status)}`}>
                      {task.status?.replace('-', ' ') || '-'}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(task.due_date)}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={task.completed || false}
                      onCheckedChange={() => toggleCompleted(task.id, task.completed || false)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(task)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(task.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
