import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const PlatformAdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isPlatformAdmin, loading } = usePlatformAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isPlatformAdmin) {
      toast.error("Unauthorized Access", {
        description: "This area is restricted to platform administrators only."
      });
      navigate("/app");
    }
  }, [isPlatformAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying platform credentials...</p>
        </div>
      </div>
    );
  }

  return isPlatformAdmin ? <>{children}</> : null;
};
