import { OrganizationAdminManager } from "@/components/admin/OrganizationAdminManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Server, ShieldCheck } from "lucide-react";

const PlatformAdminDashboard = () => {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground">
          System health, organization metrics, and global administration.
        </p>
      </div>

      {/* Quick Status Row - Placeholder for Phase 6 Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Operational</div>
            <p className="text-xs text-muted-foreground">All systems normal</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Database Load</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Healthy</div>
            <p className="text-xs text-muted-foreground">Replica lag: 0ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Security Alerts</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">0</div>
            <p className="text-xs text-muted-foreground">No active threats detected</p>
          </CardContent>
        </Card>
      </div>

      {/* Existing Component Integration */}
      <OrganizationAdminManager />
    </div>
  );
};

export default PlatformAdminDashboard;
