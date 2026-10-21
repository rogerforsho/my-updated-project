export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'gold' | 'ghost' | 'outline' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({ loading, variant = 'primary', size = 'default', children, className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] select-none disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer';

  const sizes = {
    default: 'px-5 py-2.5 text-sm',
    sm: 'px-3.5 py-1.5 text-xs',
    lg: 'px-6 py-3 text-base',
    icon: 'h-9 w-9 p-0',
  };

  const variants = {
    primary: 'bg-[#0A3824] text-white hover:bg-[#174E32] focus:ring-2 focus:ring-[#45644A]/35 focus:ring-offset-1 border border-emerald-900/20',
    gold: 'bg-[#E4DBC4] text-[#092E1D] hover:bg-[#D8D0BA] focus:ring-2 focus:ring-[#45644A]/35 focus:ring-offset-1 font-bold',
    ghost: 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100/90 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700',
    outline: 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 shadow-xs',
    secondary: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:text-slate-950 dark:hover:text-white focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 shadow-xs',
    destructive: 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-xs focus:ring-2 focus:ring-rose-500/30 border border-rose-700/40 shadow-xs',
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

export default Button;
