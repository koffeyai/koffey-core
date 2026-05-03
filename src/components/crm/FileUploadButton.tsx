import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  entityType: string;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  onFileSelect,
  disabled = false,
  entityType
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.spreadsheet'
    ];

    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV, Excel (.xls, .xlsx), or Google Sheets file.',
        variant: 'destructive'
      });
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB.',
        variant: 'destructive'
      });
      return;
    }

    onFileSelect(file);
    
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        disabled={disabled}
        className="flex items-center gap-2"
      >
        <Upload className="h-4 w-4" />
        Import {entityType}
      </Button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
};