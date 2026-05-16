import api from './api';
import { ScheduleEvent, ScheduleEventFilters } from '@/types/schedule';

/**
 * Fetch schedule events with optional filters
 */
export async function fetchEvents(filters?: ScheduleEventFilters): Promise<ScheduleEvent[]> {
  const params = new URLSearchParams();
  
  if (filters?.start_date) {
    params.append('start_date', filters.start_date);
  }
  if (filters?.end_date) {
    params.append('end_date', filters.end_date);
  }
  if (filters?.branch_id) {
    params.append('branch_id', filters.branch_id);
  }
  if (filters?.city_id) {
    params.append('city_id', filters.city_id);
  }
  if (filters?.studio_rental) {
    params.append('studio_rental', '1');
  }

  const response = await api.get(`/scheduling/events/?${params.toString()}`);
  return response.data;
}

/**
 * Fetch a single event by ID
 */
export async function fetchEvent(eventId: string): Promise<ScheduleEvent> {
  const response = await api.get(`/scheduling/events/${eventId}/`);
  return response.data;
}

/**
 * Create a new schedule event
 */
export async function createEvent(eventData: Partial<ScheduleEvent>): Promise<ScheduleEvent> {
  const response = await api.post('/scheduling/events/', eventData);
  return response.data;
}

/**
 * Update an existing event
 */
export async function updateEvent(eventId: string, eventData: Partial<ScheduleEvent>): Promise<ScheduleEvent> {
  const response = await api.patch(`/scheduling/events/${eventId}/`, eventData);
  return response.data;
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  await api.delete(`/scheduling/events/${eventId}/`);
}

/**
 * Upload files for an event (if needed)
 * Note: This is a placeholder - actual file upload logic depends on backend implementation
 */
export async function uploadEventFiles(files: File[]): Promise<string[]> {
  // TODO: Implement file upload logic when backend supports it
  // For now, return empty array
  return [];
}

