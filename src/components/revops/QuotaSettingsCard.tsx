import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Check, Loader2 } from 'lucide-react';
import { QuotaPeriod, SalesQuota } from '@/hooks/useQuota';

interface QuotaSettingsCardProps {
  quota: SalesQuota | null;
  saving: boolean;
  canManageQuota: boolean;
  onSave: (amount: number, period: QuotaPeriod) => Promise<boolean>;
}

export const QuotaSettingsCard: React.FC<QuotaSettingsCardProps> = ({
  quota,
  saving,
  canManageQuota,
  onSave
}) => {
  const [amount, setAmount] = useState<string>('');
  const [period, setPeriod] = useState<QuotaPeriod>('quarterly');
  const [isEditing, setIsEditing] = useState(!quota);

  useEffect(() => {
    if (quota) {
      setAmount(quota.amount.toString());
      setPeriod(quota.period);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [quota]);

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (isNaN(numAmount) || numAmount <= 0) return;
    
    const success = await onSave(numAmount, period);
    if (success) {
      setIsEditing(false);
    }
  };

  const formatDisplayAmount = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPeriodLabel = (p: QuotaPeriod) => {
    switch (p) {
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'annual': return 'Annual';
    }
  };

  if (!isEditing && quota) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Revenue Target</CardTitle>
            </div>
            {canManageQuota && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatDisplayAmount(quota.amount)}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {getPeriodLabel(quota.period)}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If user can't manage quotas and no quota exists, show read-only message
  if (!canManageQuota && !quota) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Revenue Target</CardTitle>
          </div>
          <CardDescription>
            No target set. Contact your manager to set a revenue goal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Set Revenue Target</CardTitle>
        </div>
        <CardDescription>
          Define your revenue goal to track progress
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Target Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="amount"
              type="text"
              inputMode="numeric"
              placeholder="500,000"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setAmount(val ? parseInt(val).toLocaleString() : '');
              }}
              className="pl-7"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="period">Period</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as QuotaPeriod)}>
            <SelectTrigger id="period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={saving || !amount}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Target
              </>
            )}
          </Button>
          {quota && (
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
