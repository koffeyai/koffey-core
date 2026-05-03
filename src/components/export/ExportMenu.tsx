import React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Download } from "lucide-react";
import { exportEntityCSV, exportFullBackupZip } from "@/services/exportService";
import type { CRMEntity as CRMEntityType } from "@/hooks/useCRM";

export const ExportMenu: React.FC = () => {
  const handleExport = (entity: CRMEntityType) => () => exportEntityCSV(entity);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hover-scale">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={handleExport("contacts")}>Contacts (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleExport("deals")}>Deals (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleExport("activities")}>Activities (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleExport("tasks")}>Tasks (CSV)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleExport("accounts")}>Accounts (CSV)</DropdownMenuItem>
        <Separator className="my-1" />
        <DropdownMenuItem onClick={exportFullBackupZip}>
          <Download className="h-4 w-4 mr-2" />
          Full backup (ZIP)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
