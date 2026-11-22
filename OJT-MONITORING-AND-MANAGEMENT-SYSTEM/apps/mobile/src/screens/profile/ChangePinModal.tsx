import { useState } from 'react';
import { Modal } from 'react-native';
import PinPad from '../../components/PinPad';
import { changePin, getPin, validPin, verifyPin } from '../../lib/pinAuth';

const MAX_TRIES = 5;

// Current PIN, then the new one, then confirm it. Forgot the current PIN? Sign out, then use Forgot PIN on the pad.
export default function ChangePinModal({ userId, onClose, onDone, onLocked }: {
  userId: string;
  onClose: () => void;
  onDone: () => void;
  onLocked: () => Promise<void>; // five wrong current PINs: full sign-out
}) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState('');

  async function handleComplete(pin: string): Promise<'error' | void> {
    setError('');
    if (step === 'current') {
      const result = await verifyPin(userId, pin);
      if (result === 'locked') { await onLocked(); return; }
      if (result === 'wrong') {
        const left = MAX_TRIES - ((await getPin(userId))?.failures ?? 0);
        setError(`Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
        return 'error';
      }
      setStep('new');
      return;
    }
    if (step === 'new') {
      if (!validPin(pin)) { setError('Choose a less predictable PIN. Not 1234 or 1111.'); return 'error'; }
      setFresh(pin); setStep('confirm');
      return;
    }
    if (pin !== fresh) { setStep('new'); setFresh(''); setError('PINs did not match. Start again.'); return 'error'; }
    try { await changePin(userId, pin); onDone(); }
    catch { setError('Could not update your PIN. Try again.'); return 'error'; }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <PinPad
        title={step === 'current' ? 'Enter your current PIN' : step === 'new' ? 'Enter a new PIN' : 'Confirm your new PIN'}
        error={error}
        onClose={onClose}
        onComplete={handleComplete}
      />
    </Modal>
  );
}
