import { useState, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

interface OptimisticOperation<T> {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: T;
  originalData?: T;
  rollback: () => Promise<void>;
}

export const useOptimisticUpdates = <T extends { id: string }>() => {
  const [pendingOperations, setPendingOperations] = useState<OptimisticOperation<T>[]>([]);
  const operationIdCounter = useRef(0);

  const generateOperationId = () => {
    operationIdCounter.current += 1;
    return `op_${Date.now()}_${operationIdCounter.current}`;
  };

  const addOptimisticUpdate = useCallback(
    (
      type: 'create' | 'update' | 'delete',
      data: T,
      originalData: T | undefined,
      rollback: () => Promise<void>
    ) => {
      const operation: OptimisticOperation<T> = {
        id: generateOperationId(),
        type,
        data,
        originalData,
        rollback
      };

      setPendingOperations(prev => [...prev, operation]);
      return operation.id;
    },
    []
  );

  const commitOperation = useCallback((operationId: string) => {
    setPendingOperations(prev => prev.filter(op => op.id !== operationId));
  }, []);

  const rollbackOperation = useCallback(async (operationId: string) => {
    const operation = pendingOperations.find(op => op.id === operationId);
    if (!operation) return;

    try {
      await operation.rollback();
      setPendingOperations(prev => prev.filter(op => op.id !== operationId));
      toast({
        title: 'Operation rolled back',
        description: 'Changes have been reverted due to an error.',
        variant: 'default'
      });
    } catch (error) {
      console.error('Rollback failed:', error);
      toast({
        title: 'Rollback failed',
        description: 'Unable to revert changes. Please refresh the page.',
        variant: 'destructive'
      });
    }
  }, [pendingOperations]);

  const rollbackAllOperations = useCallback(async () => {
    const rollbackPromises = pendingOperations.map(op => op.rollback());
    
    try {
      await Promise.all(rollbackPromises);
      setPendingOperations([]);
      toast({
        title: 'All operations rolled back',
        description: 'All pending changes have been reverted.',
        variant: 'default'
      });
    } catch (error) {
      console.error('Bulk rollback failed:', error);
      toast({
        title: 'Rollback failed',
        description: 'Some changes could not be reverted. Please refresh the page.',
        variant: 'destructive'
      });
    }
  }, [pendingOperations]);

  const isPending = useCallback((itemId: string) => {
    return pendingOperations.some(op => op.data.id === itemId);
  }, [pendingOperations]);

  const getPendingOperation = useCallback((itemId: string) => {
    return pendingOperations.find(op => op.data.id === itemId);
  }, [pendingOperations]);

  return {
    pendingOperations,
    addOptimisticUpdate,
    commitOperation,
    rollbackOperation,
    rollbackAllOperations,
    isPending,
    getPendingOperation,
    hasPendingOperations: pendingOperations.length > 0
  };
};