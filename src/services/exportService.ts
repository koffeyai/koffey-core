import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logError, logInfo } from "@/lib/logger";
import type { CRMEntity as CRMEntityType } from "@/hooks/useCRM";

const TABLES: Record<CRMEntityType, string> = {
  contacts: "contacts",
  deals: "deals",
  accounts: "accounts",
  tasks: "tasks",
  activities: "activities",
};

function sanitizeForCSV(value: any): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Escape quotes
  if (str.includes('"')) str = str.replace(/"/g, '""');
  // Wrap if contains comma, quote, or newline
  if (/[",\n]/.test(str)) str = `"${str}"`;
  return str;
}

function jsonToCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headerSet: Set<string> = rows.reduce((set: Set<string>, row: Record<string, any>) => {
    Object.keys(row || {}).forEach((k) => set.add(k));
    return set;
  }, new Set<string>());
  const headers: string[] = Array.from(headerSet);
  const headerLine = headers.join(",");
  const dataLines = rows.map((row: Record<string, any>) =>
    headers.map((h: string) => sanitizeForCSV(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function getUserOrgIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_user_organization_ids");
  if (error) throw error;
  return (data as string[]) || [];
}

export async function exportEntityCSV(entityType: CRMEntityType) {
  try {
    const table = TABLES[entityType];
    const orgIds = await getUserOrgIds();
    if (!orgIds.length) {
      toast({ title: "No data", description: "You are not a member of any organization." });
      return;
    }

    const { data, error } = await supabase
      .from(table as any)
      .select("*")
      .in("organization_id", orgIds);

    if (error) throw error;

    const csv = jsonToCSV(data || []);
    const ts = new Date().toISOString().replace(/[:TZ]/g, "-").slice(0, 19);
    downloadBlob(csv, `${entityType}-export-${ts}.csv`, "text/csv;charset=utf-8;");

    logInfo("CSV export completed", { entityType, rowCount: data?.length || 0 });
    toast({ title: "Export ready", description: `${data?.length || 0} rows exported.` });
  } catch (err: any) {
    logError("CSV export failed", { message: err?.message });
    toast({ title: "Export failed", description: err?.message || "Please try again", variant: "destructive" });
  }
}

export async function exportFullBackupZip() {
  try {
    const ts = new Date().toISOString().replace(/[:TZ]/g, "-").slice(0, 19);
    const res = await supabase.functions.invoke("export-backup", {
      body: { tables: Object.values(TABLES) },
      headers: { Accept: "application/zip" },
      noResolveJson: true,
    } as any);

    const response: Response = (res as any).data ?? (res as any);
    if (!response || !(response instanceof Response)) {
      throw new Error("Unexpected response from backup function");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Backup failed (${response.status})`);
    }

    const buf = await response.arrayBuffer();
    downloadBlob(buf, `crm-backup-${ts}.zip`, "application/zip");
    logInfo("Full backup ZIP downloaded");
    toast({ title: "Backup ready", description: "Your ZIP backup has been downloaded." });
  } catch (err: any) {
    logError("Full backup failed", { message: err?.message });
    toast({ title: "Backup failed", description: err?.message || "Please try again", variant: "destructive" });
  }
}
