'use client';

import { useState, useRef } from 'react';
import { 
  Upload, Download, Mail, MessageCircle, Trash2, 
  FileText, File, Image as ImageIcon, Video, X 
} from 'lucide-react';
import api from '@/lib/api';
import { BranchFile } from '@/types/branch';
import { 
  formatFileSize, 
  validateFile, 
  generateWhatsAppLink, 
  generateEmailLink,
  isVideoFile,
  isImageFile
} from '@/lib/branchUtils';

interface BranchFilesProps {
  branchId: string;
  files: BranchFile[];
  onFilesChange: () => void;
}

export default function BranchFiles({ branchId, files, onFilesChange }: BranchFilesProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (file: BranchFile) => {
    if (file.file_type === 'video' || isVideoFile(file.mime_type)) {
      return Video;
    }
    if (isImageFile(file.mime_type)) {
      return ImageIcon;
    }
    if (file.mime_type?.includes('pdf')) {
      return FileText;
    }
    return File;
  };

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    const validation = validateFile(file);
    
    if (!validation.valid) {
      setError(validation.error || 'קובץ לא תקין');
      return;
    }

    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('branch', branchId);

      const response = await api.post('/core/branch-files/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });

      onFilesChange();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setError(error.response?.data?.detail || error.response?.data?.file?.[0] || 'שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק קובץ זה?')) return;

    try {
      await api.delete(`/core/branch-files/${fileId}/`);
      onFilesChange();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('שגיאה במחיקת הקובץ');
    }
  };

  const handleDownload = (file: BranchFile) => {
    window.open(file.file_url, '_blank');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">העלה קובץ או סרטון</h3>
        <p className="text-sm text-muted-foreground mb-4">
          גרור ושחרר קובץ כאן או לחץ לבחירה
        </p>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary"
          disabled={uploading}
        >
          {uploading ? 'מעלה...' : 'בחר קובץ'}
        </button>
        <p className="text-xs text-muted-foreground mt-3">
          סוגי קבצים נתמכים: PDF, DOC, XLSX, תמונות, וידאו (עד 50MB)
        </p>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="p-4 bg-accent rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">מעלה קובץ...</span>
            <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-border rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-destructive/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Files List */}
      {files.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          אין קבצים להצגה. העלה קובץ ראשון.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-right py-3 px-4 font-semibold">סוג</th>
                <th className="text-right py-3 px-4 font-semibold">שם קובץ</th>
                <th className="text-right py-3 px-4 font-semibold">גודל</th>
                <th className="text-right py-3 px-4 font-semibold">תאריך</th>
                <th className="text-right py-3 px-4 font-semibold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const Icon = getFileIcon(file);
                const uploadDate = new Date(file.created_at).toLocaleDateString('he-IL');

                return (
                  <tr key={file.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-3 px-4">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </td>
                    <td className="py-3 px-4 font-medium">{file.file_name}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatFileSize(file.file_size)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{uploadDate}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(file)}
                          className="p-2 hover:bg-accent rounded-lg transition-colors"
                          title="הורדה"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <a
                          href={generateEmailLink(file.file_url, file.file_name)}
                          className="p-2 hover:bg-accent rounded-lg transition-colors"
                          title="שלח במייל"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                        <a
                          href={generateWhatsAppLink(file.file_url, file.file_name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-accent rounded-lg transition-colors"
                          title="שלח בוואטסאפ"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

