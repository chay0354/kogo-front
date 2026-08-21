import api from '@/lib/api';

/** Dump generation can take well over a minute on a full database — give it real headroom. */
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

export async function downloadDatabaseBackup(): Promise<void> {
  const response = await api.get('/core/devops/backup/', {
    responseType: 'blob',
    timeout: BACKUP_TIMEOUT_MS,
  });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `kogomalo_backup_${Date.now()}.json`;

  const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
