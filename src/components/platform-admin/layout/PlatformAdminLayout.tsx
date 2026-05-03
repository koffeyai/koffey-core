import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  ShieldAlert, 
  Database, 
  LogOut,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  path: string;
  isActive: boolean;
  onClick: () => void;
}

const NavItem = ({ icon: Icon, label, isActive, onClick }: NavItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors",
      isActive 
        ? "bg-primary text-primary-foreground" 
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
  >
    <Icon className="h-5 w-5" />
    {label}
  </button>
);

export const PlatformAdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: "Overview", path: "/platform-admin" },
    { icon: Building2, label: "Organizations", path: "/platform-admin/organizations" },
    { icon: Users, label: "Global Users", path: "/platform-admin/users" },
    { icon: ShieldAlert, label: "Security & Audit", path: "/platform-admin/security" },
    { icon: Database, label: "Backups", path: "/platform-admin/backups" },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
              K
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Koffey.ai</h1>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">PLATFORM</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              isActive={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/app')}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Exit Admin
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <h1 className="font-semibold text-foreground">Platform Admin</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur-sm pt-16">
            <nav className="p-4 space-y-1">
              {navItems.map((item) => (
                <NavItem
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  path={item.path}
                  isActive={location.pathname === item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMobileMenuOpen(false);
                  }}
                />
              ))}
            </nav>
          </div>
        )}

        {/* Content Outlet */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
