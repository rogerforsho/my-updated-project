'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F2] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl font-bold mb-4 shadow-sm">
        !
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-slate-500 max-w-sm">
        An unexpected error occurred while loading this page.
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 inline-flex items-center px-5 py-2.5 rounded-xl bg-[#0A3824] hover:bg-[#072a19] text-[#D5B254] font-semibold text-sm shadow-md transition-all active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}
