-- Make required_hours nullable — set by coordinator per assignment, not hardcoded at registration
-- FR-PROG-004: required hours are configurable, not guessed or hard-coded
alter table students alter column required_hours drop not null;

-- Add student read policy for qr_tokens so mobile QR validation works
-- Students need to read the token to validate it during Time In
drop policy if exists "student_read_qr_for_validation" on qr_tokens;
create policy "student_read_qr_for_validation" on qr_tokens
  for select using (get_my_role() = 'Student');
