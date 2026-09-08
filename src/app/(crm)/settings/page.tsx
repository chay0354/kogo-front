import { redirect } from 'next/navigation';

/** Settings is a hub of category pages; the bare URL opens the first one. */
export default function SettingsIndexPage() {
  redirect('/settings/users');
}
