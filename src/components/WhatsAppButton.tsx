import SocialIcon from './SocialIcon';

// Floating WhatsApp bubble — number comes from the DB setting
// `contact.whatsapp` (docs/DATABASE.md §7), passed down from the layout.
export default function WhatsAppButton({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="z-[1000] fixed bottom-6 right-6 bg-green-500 rounded-full text-white shadow-lg hover:bg-green-400 flex justify-center items-center w-20 h-20"
    >
      <SocialIcon platform="whatsapp" className="w-10 h-10" />
    </a>
  );
}
