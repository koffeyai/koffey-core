import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

export const usePlatformAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (authLoading) return;
      
      if (!user) {
        setIsPlatformAdmin(false);
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('platform_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking platform admin status:', error);
          setIsPlatformAdmin(false);
        } else {
          setIsPlatformAdmin(!!data);
        }
      } catch (err) {
        console.error('Error checking platform admin status:', err);
        setIsPlatformAdmin(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkAdmin();
  }, [user, authLoading]);

  return { isPlatformAdmin, loading };
};
