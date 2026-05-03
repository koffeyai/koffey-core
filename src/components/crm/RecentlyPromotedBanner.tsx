import React from 'react';
import { useRecentlyPromoted } from '@/hooks/useRecentlyPromoted';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PartyPopper, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface RecentlyPromotedBannerProps {
  onDismiss?: () => void;
}

export const RecentlyPromotedBanner: React.FC<RecentlyPromotedBannerProps> = ({ onDismiss }) => {
  const { data: promotedContacts, isLoading } = useRecentlyPromoted(7);

  if (isLoading || !promotedContacts?.length) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-800">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full">
              <PartyPopper className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-green-800 dark:text-green-200">
                  Recent Conversions!
                </h3>
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {promotedContacts.length} new customer{promotedContacts.length > 1 ? 's' : ''}
                </Badge>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                These leads converted to customers in the last 7 days:
              </p>
              <div className="flex flex-wrap gap-2">
                {promotedContacts.slice(0, 5).map((contact) => (
                  <Badge 
                    key={contact.id} 
                    variant="outline" 
                    className="bg-white/50 dark:bg-green-950/50 border-green-300 dark:border-green-700"
                  >
                    <span className="font-medium">{contact.full_name || contact.email || 'Unknown'}</span>
                    {contact.status_changed_at && (
                      <span className="ml-1 text-muted-foreground text-xs">
                        ({formatDistanceToNow(new Date(contact.status_changed_at), { addSuffix: true })})
                      </span>
                    )}
                  </Badge>
                ))}
                {promotedContacts.length > 5 && (
                  <Badge variant="outline" className="bg-white/50 dark:bg-green-950/50">
                    +{promotedContacts.length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {onDismiss && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onDismiss}
              className="text-green-600 hover:text-green-800 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/50"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
