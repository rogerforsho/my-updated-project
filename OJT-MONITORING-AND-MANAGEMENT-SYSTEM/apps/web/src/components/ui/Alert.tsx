interface AlertProps {
  type: 'error' | 'success' | 'info';
  message: string;
}

const styles = {
  error: 'bg-red-50 dark:bg-rose-950/40 border-red-200 dark:border-rose-800/60 text-red-700 dark:text-rose-300 font-medium',
  success: 'bg-[#0A3824]/10 dark:bg-emerald-950/40 border-[#0A3824]/30 dark:border-emerald-800/60 text-[#0A3824] dark:text-emerald-300 font-bold',
  info: 'bg-blue-50 dark:bg-sky-950/40 border-blue-200 dark:border-sky-800/60 text-blue-700 dark:text-sky-300 font-medium',
};

export default function Alert({ type, message }: AlertProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${styles[type]}`}>
      {message}
    </div>
  );
}
