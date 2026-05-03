import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

type EntityType = 'contacts' | 'accounts' | 'deals';

interface ImportRow {
  rowNum: number;
  data: Record<string, string>;
  status: 'pending' | 'success' | 'error' | 'duplicate';
  error?: string;
}

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  contacts: ['name'],
  accounts: ['name'],
  deals: ['name'],
};

const SAMPLE_HEADERS: Record<EntityType, string[]> = {
  contacts: ['name', 'email', 'phone', 'title', 'company', 'status'],
  accounts: ['name', 'website', 'industry', 'description'],
  deals: ['name', 'amount', 'stage', 'probability', 'close_date'],
};

const BulkImport: React.FC = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const fileRef = useRef<HTMLInputElement>(null);

  const [entityType, setEntityType] = useState<EntityType>('contacts');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');

  const parseCSV = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'));
    const parsed = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      hdrs.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });

    return { headers: hdrs, rows: parsed };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers: hdrs, rows: parsed } = parseCSV(text);
      setHeaders(hdrs);
      setRows(parsed.map((data, i) => ({ rowNum: i + 2, data, status: 'pending' as const })));
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const validateRow = (row: Record<string, string>): string | null => {
    for (const field of REQUIRED_FIELDS[entityType]) {
      if (!row[field]?.trim()) return `Missing required field: ${field}`;
    }
    if (entityType === 'contacts' && row['email'] && !/\S+@\S+\.\S+/.test(row['email'])) {
      return 'Invalid email format';
    }
    if (entityType === 'deals' && row['amount'] && isNaN(Number(row['amount']))) {
      return 'Amount must be a number';
    }
    return null;
  };

  const runImport = async () => {
    if (!organizationId || !user) return;
    setImporting(true);
    setProgress(0);

    const updatedRows = [...rows];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      const validationError = validateRow(row.data);

      if (validationError) {
        row.status = 'error';
        row.error = validationError;
        errorCount++;
      } else {
        try {
          const record: any = {
            ...row.data,
            organization_id: organizationId,
          };

          // Type conversions
          if (entityType === 'deals') {
            if (record.amount) record.amount = Number(record.amount);
            if (record.probability) record.probability = Number(record.probability);
          }

          // Check for duplicates
          if (entityType === 'contacts' && row.data.email) {
            const { data: existing } = await supabase
              .from('contacts')
              .select('id')
              .eq('organization_id', organizationId)
              .eq('email', row.data.email)
              .limit(1);

            if (existing && existing.length > 0) {
              row.status = 'duplicate';
              row.error = `Duplicate email: ${row.data.email}`;
              errorCount++;
              setProgress(Math.round(((i + 1) / updatedRows.length) * 100));
              continue;
            }
          }

          const { error } = await supabase
            .from(entityType)
            .insert(record);

          if (error) throw error;
          row.status = 'success';
          successCount++;
        } catch (err: any) {
          row.status = 'error';
          row.error = err.message || 'Import failed';
          errorCount++;
        }
      }

      setProgress(Math.round(((i + 1) / updatedRows.length) * 100));
    }

    setRows(updatedRows);
    setImporting(false);
    setStep('results');
    toast.success(`Import complete: ${successCount} succeeded, ${errorCount} failed`);
  };

  const downloadTemplate = () => {
    const hdrs = SAMPLE_HEADERS[entityType];
    const csv = hdrs.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityType}_import_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setStep('upload');
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Import</h1>
          <p className="text-muted-foreground">Import contacts, accounts, or deals from CSV</p>
        </div>
        <div className="flex gap-2">
          <Select value={entityType} onValueChange={(v: any) => { setEntityType(v); reset(); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contacts">Contacts</SelectItem>
              <SelectItem value="accounts">Accounts</SelectItem>
              <SelectItem value="deals">Deals</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Template
          </Button>
        </div>
      </div>

      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Drop your CSV file here</h3>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <Badge variant="outline">
                Required fields: {REQUIRED_FIELDS[entityType].join(', ')}
              </Badge>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview ({rows.length} rows)
            </CardTitle>
            <CardDescription>Review your data before importing</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">#</th>
                    {headers.map(h => <th key={h} className="text-left p-2">{h}</th>)}
                    <th className="text-left p-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => {
                    const err = validateRow(row.data);
                    return (
                      <tr key={i} className={`border-b ${err ? 'bg-destructive/5' : ''}`}>
                        <td className="p-2">{row.rowNum}</td>
                        {headers.map(h => <td key={h} className="p-2">{row.data[h] || '-'}</td>)}
                        <td className="p-2">
                          {err ? (
                            <Badge variant="destructive" className="text-xs">{err}</Badge>
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Showing first 50 of {rows.length} rows
                </p>
              )}
            </ScrollArea>
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={runImport} disabled={importing}>
                {importing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Import {rows.length} {entityType}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {importing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'results' && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 border rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">{rows.filter(r => r.status === 'success').length}</div>
                <div className="text-sm text-muted-foreground">Imported</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">{rows.filter(r => r.status === 'duplicate').length}</div>
                <div className="text-sm text-muted-foreground">Duplicates</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <div className="text-2xl font-bold">{rows.filter(r => r.status === 'error').length}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {rows.filter(r => r.status !== 'success').length > 0 && (
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {rows.filter(r => r.status !== 'success').map((row, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 border rounded">
                      <Badge variant={row.status === 'duplicate' ? 'secondary' : 'destructive'} className="text-xs">
                        Row {row.rowNum}
                      </Badge>
                      <span className="text-muted-foreground">{row.error}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <Button onClick={reset} className="mt-4">Import More</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkImport;
