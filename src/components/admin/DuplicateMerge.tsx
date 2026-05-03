import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  Copy,
  Merge,
  RefreshCw,
  CheckCircle,
  Users,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface DuplicateGroup {
  field: string;
  value: string;
  records: any[];
  entity: string;
}

const DuplicateMerge: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [entityType, setEntityType] = useState<'contacts' | 'accounts'>('contacts');
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId) findDuplicates();
  }, [organizationId, entityType]);

  const findDuplicates = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const groups: DuplicateGroup[] = [];

      if (entityType === 'contacts') {
        // Find contacts with duplicate emails
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, email, phone, title, company, status, created_at')
          .eq('organization_id', organizationId)
          .not('email', 'is', null)
          .order('created_at', { ascending: true });

        if (contacts) {
          const emailMap: Record<string, any[]> = {};
          contacts.forEach(c => {
            const key = (c.email || '').toLowerCase().trim();
            if (key) {
              if (!emailMap[key]) emailMap[key] = [];
              emailMap[key].push(c);
            }
          });
          Object.entries(emailMap).forEach(([email, records]) => {
            if (records.length > 1) {
              groups.push({ field: 'email', value: email, records, entity: 'contacts' });
            }
          });

          // Also check name duplicates
          const nameMap: Record<string, any[]> = {};
          contacts.forEach(c => {
            const key = (c.name || '').toLowerCase().trim();
            if (key && key.length > 2) {
              if (!nameMap[key]) nameMap[key] = [];
              nameMap[key].push(c);
            }
          });
          Object.entries(nameMap).forEach(([name, records]) => {
            if (records.length > 1 && !groups.find(g => g.records.some(r => records.some(r2 => r2.id === r.id)))) {
              groups.push({ field: 'name', value: name, records, entity: 'contacts' });
            }
          });
        }
      } else {
        // Find accounts with duplicate names
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, website, industry, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: true });

        if (accounts) {
          const nameMap: Record<string, any[]> = {};
          accounts.forEach(a => {
            const key = (a.name || '').toLowerCase().trim().replace(/\s+(inc|llc|ltd|corp|co)\.?$/i, '');
            if (key) {
              if (!nameMap[key]) nameMap[key] = [];
              nameMap[key].push(a);
            }
          });
          Object.entries(nameMap).forEach(([name, records]) => {
            if (records.length > 1) {
              groups.push({ field: 'name', value: name, records, entity: 'accounts' });
            }
          });
        }
      }

      setDuplicates(groups);
    } catch (err) {
      console.error('Failed to find duplicates:', err);
      toast.error('Failed to scan for duplicates');
    } finally {
      setLoading(false);
    }
  };

  const mergeDuplicates = async (group: DuplicateGroup, keepIdx: number) => {
    if (!organizationId) return;
    const keepRecord = group.records[keepIdx];
    const removeRecords = group.records.filter((_, i) => i !== keepIdx);
    setMerging(group.value);

    try {
      if (group.entity === 'contacts') {
        // Move activities from duplicates to keeper
        for (const dup of removeRecords) {
          await supabase
            .from('activities')
            .update({ contact_id: keepRecord.id })
            .eq('contact_id', dup.id)
            .eq('organization_id', organizationId);

          // Move deal_contacts
          await supabase
            .from('deal_contacts')
            .update({ contact_id: keepRecord.id })
            .eq('contact_id', dup.id);

          // Delete duplicate
          await supabase
            .from('contacts')
            .delete()
            .eq('id', dup.id)
            .eq('organization_id', organizationId);
        }
      } else {
        // Move contacts and deals from duplicates to keeper
        for (const dup of removeRecords) {
          await supabase
            .from('contacts')
            .update({ account_id: keepRecord.id })
            .eq('account_id', dup.id)
            .eq('organization_id', organizationId);

          await supabase
            .from('deals')
            .update({ account_id: keepRecord.id })
            .eq('account_id', dup.id)
            .eq('organization_id', organizationId);

          await supabase
            .from('accounts')
            .delete()
            .eq('id', dup.id)
            .eq('organization_id', organizationId);
        }
      }

      toast.success(`Merged ${removeRecords.length + 1} records into one`);
      findDuplicates();
    } catch (err) {
      console.error('Merge failed:', err);
      toast.error('Failed to merge records');
    } finally {
      setMerging(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Scanning for duplicates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Duplicate Management</h1>
          <p className="text-muted-foreground">
            {duplicates.length} duplicate groups found
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={entityType} onValueChange={(v: any) => setEntityType(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contacts">Contacts</SelectItem>
              <SelectItem value="accounts">Accounts</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={findDuplicates}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rescan
          </Button>
        </div>
      </div>

      {duplicates.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="No duplicates found"
          description={`Your ${entityType} data looks clean! No duplicate records detected.`}
        />
      ) : (
        <div className="space-y-4">
          {duplicates.map((group, gi) => (
            <Card key={gi}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {entityType === 'contacts' ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  Duplicate {group.field}: "{group.value}"
                  <Badge variant="secondary">{group.records.length} records</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.records.map((record, ri) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{record.name || record.email || 'No name'}</div>
                        <div className="text-sm text-muted-foreground">
                          {entityType === 'contacts' ? (
                            <>
                              {record.email && <span>{record.email}</span>}
                              {record.title && <span> | {record.title}</span>}
                              {record.company && <span> @ {record.company}</span>}
                            </>
                          ) : (
                            <>
                              {record.website && <span>{record.website}</span>}
                              {record.industry && <span> | {record.industry}</span>}
                            </>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(record.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mergeDuplicates(group, ri)}
                        disabled={merging === group.value}
                      >
                        {merging === group.value ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Merge className="h-4 w-4 mr-1" />
                        )}
                        Keep This
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Click "Keep This" on the record you want to keep. Others will be merged into it.
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DuplicateMerge;
