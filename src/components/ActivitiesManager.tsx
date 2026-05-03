import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit, Trash2, Calendar, UserPlus, Pencil, Trash, Phone, Mail, Presentation, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from '@/hooks/use-toast';
import { usePageContextSync } from '@/hooks/usePageContextSync';

interface Activity {
  id: string;
  title: string;
  type: string;
  description: string | null;
  scheduled_at: string | null;
  completed: boolean | null;
  created_at: string;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
}

/** Manual activity types users can create */
const MANUAL_ACTIVITY_TYPES = [
  'meeting',
  'call',
  'email',
  'demo',
  'follow-up',
  'other'
];

/** All activity types including auto-logged CRM events */
const ALL_ACTIVITY_TYPES = [
  ...MANUAL_ACTIVITY_TYPES,
  'crm_create',
  'crm_update',
  'crm_delete',
];

/** Filter categories for the type toggle */
type ActivityFilter = 'all' | 'manual' | 'crm_events';

const CRM_EVENT_TYPES = ['crm_create', 'crm_update', 'crm_delete'];

export const ActivitiesManager = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityFilter>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'meeting',
    description: '',
    scheduled_at: '',
    completed: false
  });

  const organizationId = currentOrganization?.organization_id;

  useEffect(() => {
    if (user && organizationId) {
      fetchActivities();
    }
  }, [user, organizationId]);

  const fetchActivities = async () => {
    if (!organizationId) return;

    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', organizationId)
      .order('scheduled_at', { ascending: false, nullsFirst: false });

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch activities', variant: 'destructive' });
    } else {
      setActivities(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId) return;

    const activityData = {
      ...formData,
      scheduled_at: formData.scheduled_at || null,
      user_id: user.id,
      organization_id: organizationId,
    };

    if (editingActivity) {
      const { error } = await supabase
        .from('activities')
        .update(activityData)
        .eq('id', editingActivity.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update activity', variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Activity updated successfully' });
        fetchActivities();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('activities')
        .insert([activityData]);

      if (error) {
        toast({ title: 'Error', description: 'Failed to create activity', variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Activity created successfully' });
        fetchActivities();
        resetForm();
      }
    }
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setFormData({
      title: activity.title,
      type: activity.type,
      description: activity.description || '',
      scheduled_at: activity.scheduled_at ? new Date(activity.scheduled_at).toISOString().slice(0, 16) : '',
      completed: activity.completed || false
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete activity', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Activity deleted successfully' });
      fetchActivities();
    }
  };

  const toggleCompleted = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from('activities')
      .update({ completed: !completed })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update activity status', variant: 'destructive' });
    } else {
      fetchActivities();
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'meeting',
      description: '',
      scheduled_at: '',
      completed: false
    });
    setEditingActivity(null);
    setIsDialogOpen(false);
  };

  // Apply both search and type filter
  const filteredActivities = activities.filter(activity => {
    const matchesSearch =
      activity.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTypeFilter =
      typeFilter === 'all' ||
      (typeFilter === 'crm_events' && CRM_EVENT_TYPES.includes(activity.type)) ||
      (typeFilter === 'manual' && !CRM_EVENT_TYPES.includes(activity.type));

    return matchesSearch && matchesTypeFilter;
  });

  // Sync visible activities to ChatContext for AI page-awareness
  const getActivityName = useCallback((activity: Activity) => activity.title || activity.type || 'Activity', []);
  usePageContextSync({
    entityType: 'activities',
    entities: filteredActivities,
    getEntityName: getActivityName,
    searchTerm,
  });

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return '-';
    return new Date(dateTime).toLocaleString();
  };

  /** Returns icon + color for each activity type */
  const getTypeDisplay = (type: string) => {
    switch (type) {
      case 'crm_create':
        return { icon: <UserPlus className="h-4 w-4" />, color: 'text-emerald-500', label: 'Created', badgeVariant: 'default' as const };
      case 'crm_update':
        return { icon: <Pencil className="h-4 w-4" />, color: 'text-blue-500', label: 'Updated', badgeVariant: 'secondary' as const };
      case 'crm_delete':
        return { icon: <Trash className="h-4 w-4" />, color: 'text-destructive', label: 'Deleted', badgeVariant: 'destructive' as const };
      case 'meeting':
        return { icon: <Calendar className="h-4 w-4" />, color: 'text-blue-600', label: 'Meeting', badgeVariant: 'outline' as const };
      case 'call':
        return { icon: <Phone className="h-4 w-4" />, color: 'text-green-600', label: 'Call', badgeVariant: 'outline' as const };
      case 'email':
        return { icon: <Mail className="h-4 w-4" />, color: 'text-purple-600', label: 'Email', badgeVariant: 'outline' as const };
      case 'demo':
        return { icon: <Presentation className="h-4 w-4" />, color: 'text-orange-600', label: 'Demo', badgeVariant: 'outline' as const };
      default:
        return { icon: <MoreHorizontal className="h-4 w-4" />, color: 'text-muted-foreground', label: type, badgeVariant: 'outline' as const };
    }
  };

  /** Check if an activity is a CRM auto-logged event (non-editable) */
  const isCrmEvent = (type: string) => CRM_EVENT_TYPES.includes(type);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Activities</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingActivity ? 'Edit Activity' : 'Add New Activity'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Activity Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_ACTIVITY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="scheduled_at">Scheduled Date & Time</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
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
                <Button type="submit">{editingActivity ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + Filter Row */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'crm_events', 'manual'] as ActivityFilter[]).map((filter) => (
            <Button
              key={filter}
              variant={typeFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(filter)}
              className="text-xs"
            >
              {filter === 'all' ? 'All' : filter === 'crm_events' ? 'CRM Events' : 'Manual'}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            All Activities ({filteredActivities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No activities found. CRM operations (creating contacts, deals, etc.) will appear here automatically.
                  </TableCell>
                </TableRow>
              )}
              {filteredActivities.map((activity) => {
                const typeDisplay = getTypeDisplay(activity.type);
                const isAuto = isCrmEvent(activity.type);

                return (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className={typeDisplay.color}>{typeDisplay.icon}</span>
                        <span>{activity.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeDisplay.badgeVariant} className="text-xs">
                        {typeDisplay.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(activity.scheduled_at || activity.created_at)}
                    </TableCell>
                    <TableCell>
                      {isAuto ? (
                        <span className="text-xs text-muted-foreground italic">Auto-logged</span>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={activity.completed || false}
                            onCheckedChange={() => toggleCompleted(activity.id, activity.completed || false)}
                          />
                          <span className={activity.completed ? 'text-emerald-500 text-sm' : 'text-muted-foreground text-sm'}>
                            {activity.completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isAuto && (
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(activity)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(activity.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
