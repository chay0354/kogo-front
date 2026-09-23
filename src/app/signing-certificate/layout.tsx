import '../widget/widget-shell.css';

export const metadata = { title: 'תעודת החתימה האלקטרונית — קוגומלו' };

// Public, no CRM shell and no account: the page brings its own header, like
// the card link page. Anyone holding one of our documents can check it here.
export default function SigningCertificateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
