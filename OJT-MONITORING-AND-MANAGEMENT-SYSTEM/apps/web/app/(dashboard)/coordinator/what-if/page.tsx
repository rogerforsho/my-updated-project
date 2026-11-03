import { redirect } from 'next/navigation';

export default function WhatIfRedirect() {
  redirect('/coordinator/progress');
}
