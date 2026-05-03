import { useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";

interface FormData {
  name: string;
  domain: string;
  ownerEmail: string;
}

export function CreateOrganizationDialog({ onOrgCreated }: { onOrgCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('admin_create_organization', {
        p_name: data.name,
        p_domain: data.domain || null,
        p_owner_email: data.ownerEmail || null
      });

      if (error) throw error;

      toast.success("Organization created successfully");
      onOrgCreated();
      setOpen(false);
      reset();
    } catch (error: any) {
      toast.error("Failed to create organization", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              {...register("name", { required: "Organization name is required" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain">Primary Domain (Optional)</Label>
            <Input
              id="domain"
              placeholder="acme.com"
              {...register("domain")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerEmail">Initial Admin Email (Optional)</Label>
            <Input
              id="ownerEmail"
              type="email"
              placeholder="admin@acme.com"
              {...register("ownerEmail")}
            />
            <p className="text-xs text-muted-foreground">
              If the user exists, they will be added as an Admin immediately.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Organization
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
