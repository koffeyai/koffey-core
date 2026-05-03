import { GlobalUserList } from "@/components/platform-admin/users/GlobalUserList";

export default function PlatformAdminUsers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Global Users</h1>
        <p className="text-muted-foreground">
          View and manage all registered users across all organizations.
        </p>
      </div>
      <GlobalUserList />
    </div>
  );
}
