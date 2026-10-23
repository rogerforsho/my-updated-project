const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { TextDecoder } = require('node:util');

const root = path.resolve(__dirname, '..');

// A small stateful database double: assertions below inspect resulting records,
// not just whether a particular query-builder method was called.
function workflowFixture(role = 'Admin', options = {}) {
  const tables = {
    users: [{ user_id: 'actor', role, account_status: options.status || 'active' }],
    staff_capability_grants: role === 'Coordinator' ? [{ user_id: 'actor', capability: 'academic_workflows', department_scope: 'ICS', revoked_at: null }] : [],
    company_branches: [
      { branch_id: 'branch', company_id: 'company', status: 'active' },
      { branch_id: 'branch-1', company_id: 'company-1', status: 'active' },
    ],
    ...options.tables,
  };
  const events = [];
  const writes = [];
  let serviceCalls = 0;
  let emailCount = 0;
  let deleted = 0;
  const field = (row, key) => key.split('.').reduce((value, part) => {
    const fieldName = part === 'progress_filter' ? 'internship_progress' : part;
    return value?.[fieldName];
  }, row);
  function from(table, serviceOnly = false) {
    let op = 'select', values, head = false, start = 0, end = Infinity;
    const filters = [];
    function execute(single = false) {
      const error = options.fail?.(table, op, serviceOnly);
      if (error) return { data: null, error: { message: error }, count: null };
      if (op === 'update') options.beforeUpdate?.(table, tables);
      let rows = (tables[table] || []).filter(row => filters.every(test => test(row)));
      if (op === 'update') { rows.forEach(row => Object.assign(row, values)); writes.push({ table, op, count: rows.length }); }
      if (op === 'delete') { tables[table] = (tables[table] || []).filter(row => !rows.includes(row)); writes.push({ table, op, count: rows.length }); }
      if (op === 'upsert' || op === 'insert') {
        rows = [];
        for (const input of Array.isArray(values) ? values : [values]) {
          const conflictKey = input.user_id ? 'user_id' : 'student_id';
          const existing = op === 'upsert' && input[conflictKey] && (tables[table] || []).find(row => row[conflictKey] === input[conflictKey]);
          if (existing) { Object.assign(existing, input); rows.push(existing); }
          else { const row = { ...input }; (tables[table] ||= []).push(row); rows.push(row); }
        }
        writes.push({ table, op, count: rows.length });
      }
      const count = rows.length;
      rows = rows.slice(start, end + 1).map(row => ({ ...row }));
      return { data: head ? null : single ? rows[0] || null : rows, count, error: null };
    }
    return {
      select(_columns, config) { head = config?.head || false; return this; },
      eq(key, value) { filters.push(row => field(row, key) === value); return this; },
      is(key, value) { filters.push(row => value === null && field(row, key) == null); return this; },
      in(key, values) { filters.push(row => values.includes(field(row, key))); return this; },
      like(key, pattern) { const prefix = pattern.replace(/%$/, ''); filters.push(row => String(field(row, key) || '').startsWith(prefix)); return this; },
      not(key, operator, value) {
        if (operator === 'is' && value === 'null') filters.push(row => field(row, key) != null);
        else if (operator === 'ilike') filters.push(row => !String(field(row, key) || '').toUpperCase().includes(value.replaceAll('%', '').toUpperCase()));
        else throw new Error('Unsupported mock not filter: ' + operator);
        return this;
      },
      or(expression) {
        const terms = expression.split(',');
        filters.push(row => terms.some(term => {
          const isNull = /^(.+)\.is\.null$/.exec(term);
          if (isNull) return field(row, isNull[1]) == null;
          const equals = /^(.+)\.eq\.(.+)$/.exec(term);
          if (equals) return String(field(row, equals[1])) === equals[2];
          const ilike = /^(.+)\.ilike\.(.*)$/.exec(term);
          if (ilike) return String(field(row, ilike[1]) || '').toUpperCase().includes(ilike[2].replaceAll('*', '').toUpperCase());
          const notNull = /^(.+)\.not\.is\.null$/.exec(term);
          if (notNull) return field(row, notNull[1]) != null;
          throw new Error('Unsupported mock OR filter: ' + term);
        }));
        return this;
      },
      order() { return this; },
      range(first, last) { start = first; end = last; return this; },
      limit(value) { end = value - 1; return this; },
      update(value) { op = 'update'; values = value; return this; },
      delete() { op = 'delete'; return this; },
      upsert(value) { op = 'upsert'; values = value; return this; },
      insert(value) { op = 'insert'; values = value; return this; },
      async single() { return execute(true); },
      async maybeSingle() { return execute(true); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
  }
  const client = { from, storage: { from() { return {
    async download() { return { data: file('report.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nvalid test document')), error: null }; },
  }; } }, async rpc(name, args = {}) {
    if (options.rpc) {
      const result = await options.rpc(name, args);
      if (result !== undefined) return result;
    }
    if (name === 'get_my_supervisor_id')
      return { data: (tables.supervisors || []).find(row => row.user_id === 'actor')?.supervisor_id || null, error: null };
    if (name === 'review_student_registration') {
      const target = (tables.users || []).find(row => row.user_id === args.p_user_id);
      if (!target || target.role !== 'Student' || target.account_status !== 'pending' ||
          !(tables.students || []).some(row => row.user_id === args.p_user_id))
        return { data: [{ result_status: 'not_found' }], error: null };
      if (args.p_status === 'active' && options.unconfirmedUsers?.includes(args.p_user_id))
        return { data: [{ result_status: 'email_unconfirmed' }], error: null };
      target.account_status = args.p_status;
      writes.push({ table: 'users', op: 'rpc', count: 1 });
      return { data: [{ result_status: 'ok', notification_created: true, email_queued: true }], error: null };
    }
    if (name === 'coordinator_review_practicum_schedule') {
      const schedule = (tables.practicum_schedules || []).find(row => row.schedule_id === args.p_schedule_id);
      if (!schedule) return { data: null, error: { code: 'P0002', message: 'Schedule proposal not found' } };
      const assignment = (tables.student_assignments || []).find(row =>
        row.student_id === schedule.student_id && row.assignment_status === 'active');
      if (args.p_action === 'approve' && assignment &&
          [assignment.company_id, assignment.branch_id, assignment.supervisor_id].some((value, i) =>
            value !== [args.p_company_id, args.p_branch_id, args.p_supervisor_id][i]))
        return { data: null, error: { code: '23505', message: 'Existing placement differs' } };
      schedule.status = { approve: 'approved', reject: 'rejected', modify: 'modified' }[args.p_action];
      writes.push({ table: 'practicum_schedules', op: 'rpc', count: 1 });
      return { data: args.p_schedule_id, error: null };
    }
    return { data: true, error: null };
  }, auth: { async getUser() { return { data: { user: role ? { id: 'actor' } : null } }; }, mfa: { async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: options.aal || 'aal2' }, error: null }; } }, async signUp() { return options.signupResponse || { data: { user: { id: 'new-student', identities: [{ provider: 'email' }] }, session: null }, error: null }; }, async signOut() { return { error: null }; } } };
  const service = { from(table) { return from(table, true); }, storage: { from() { return {
    async download() { return { data: file('student-id.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])), error: null }; },
  }; } }, async rpc() { return { data: true, error: null }; }, auth: { admin: {
    async getUserById(id) { return { data: { user: { id, email_confirmed_at: options.unconfirmedUsers?.includes(id) ? null : '2026-01-01T00:00:00Z' } }, error: null }; },
    async inviteUserByEmail(_email, input) {
      assert.match(input.redirectTo, /auth\/callback\?next=/);
      tables.users.push({ user_id: 'new-user', role: 'Student', account_status: 'pending' });
      tables.students ||= [];
      tables.students.push({ user_id: 'new-user', student_number: 'PENDING-new-user' });
      return { data: { user: { id: 'new-user' } }, error: null };
    },
    async updateUserById() { return { error: null }; },
    async deleteUser(id) {
      deleted++;
      for (const table of ['users','students','coordinators','staff_capability_grants','supervisors']) tables[table] = (tables[table] || []).filter(row => row.user_id !== id);
      return { error: null };
    },
  } } };
  const modules = {};
  function module(name) {
    return modules[name] ||= load(`apps/web/src/services/${name}.ts`, {
      '@/src/lib/supabase/server': { createClient: async () => client },
      '@/src/lib/trusted-actor': { async getTrustedActor() {
        const { data: { user } } = await client.auth.getUser();
        const profile = user ? (tables.users || []).find(row => row.user_id === user.id) || null : null;
        return profile?.account_status === 'active'
          ? { supabase: client, user, profile }
          : { supabase: client, user: null, profile: null };
      } },
      '@/src/lib/supabase/service': { getServiceClient: () => { serviceCalls++; return service; } },
      '@/src/lib/supabase/public-url': load('apps/web/src/lib/supabase/public-url.ts'),
      '@/src/lib/departments': load('apps/web/src/lib/departments.ts'),
      '@/src/lib/department-scope': load('apps/web/src/lib/department-scope.ts', { 'server-only': {} }),
      '@/src/lib/email/send-account-status': { sendAccountStatusEmail: async () => { emailCount++; return { success: true }; } },
      '@/src/lib/audit': { recordAuditEvent: async input => { events.push(input); } },
      './reports': { checkStudentGatewayStatus: async () => ({ isCleared: true, approvedCount: 5, missing: [] }) },
      '@ojt/shared': {
        ...load('shared/types/roles.ts'),
        ...load('shared/courses.ts'),
        ...load('shared/gateway.ts'),
        ...load('shared/schedulePolicy.ts'),
      },
      'server-only': {},
      'next/headers': { async headers() { return new Headers(); } },
      'next/navigation': { redirect() {} },
    }, { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'unit-test-hmac-key', NEXT_PUBLIC_APP_URL: 'https://portal.test' });
  }
  return { tables, writes, events, module, client, service, get deleted() { return deleted; }, get emailCount() { return emailCount; }, get serviceCalls() { return serviceCalls; } };
}

const attendanceId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

test('cohort progress status filters run before pagination and count matching students', async () => {
  const fixture = workflowFixture('Coordinator', { tables: { students: [
    { student_id: 'zero', student_number: '001', course: 'BSIT', users: { account_status: 'active', full_name: 'Zero' }, internship_progress: null },
    { student_id: 'new', student_number: '002', course: 'BSIT', users: { account_status: 'active', full_name: 'New' }, internship_progress: { completed_hours: 0, progress_status: 'not_started' } },
    { student_id: 'active', student_number: '003', course: 'BSIT', users: { account_status: 'active', full_name: 'Active' }, internship_progress: { completed_hours: 12, progress_status: 'in_progress' } },
    { student_id: 'done', student_number: '004', course: 'BSIT', users: { account_status: 'active', full_name: 'Done' }, internship_progress: { completed_hours: 486, progress_status: 'completed' } },
  ] } });
  const service = fixture.module('progress');
  const active = await service.listCohortProgress(1, 1, 'all', 'in_progress');
  assert.equal(active.data.total, 1);
  assert.equal(active.data.students[0].student_id, 'active');
  const notStarted = await service.listCohortProgress(1, 1, 'all', 'not_started');
  assert.equal(notStarted.data.total, 2);
  assert.equal(notStarted.data.students[0].student_id, 'zero');
  assert.equal((await service.listCohortProgress(1, 20, 'all', 'unexpected')).error.code, 'VALIDATION_FAILURE');
});

test('OJT Coordinator see only their granted department in paginated progress, totals, and clearance', async () => {
  for (const department of ['ICS', 'IBE']) {
    const fixture = workflowFixture('Coordinator', { tables: {
      staff_capability_grants: [{ user_id: 'actor', capability: 'academic_workflows', department_scope: department, revoked_at: null }],
      students: Array.from({ length: 450 }, (_, index) => ({ student_id: `s${index}`, course: index % 2 ? 'BSENTREP' : 'BSIT', users: { account_status: 'active', full_name: `Student ${index}` }, internship_progress: { completed_hours: 2, progress_status: 'in_progress' } })),
    } });
    const progress = fixture.module('progress');
    const page = await progress.listCohortProgress(2, 200);
    assert.equal(page.error, null);
    assert.equal(page.data.total, 225);
    assert.equal(page.data.students.length, 25);
    assert.equal(page.data.students.every(row => row.course === (department === 'ICS' ? 'BSIT' : 'BSENTREP')), true);
    const conflicting = await progress.listCohortProgress(1, 20, department === 'ICS' ? 'BSENTREP' : 'BSIT');
    assert.equal(conflicting.data.total, 0);
    const summary = await progress.getDepartmentSummary();
    assert.equal(summary.data.totalStudents, 225);
    assert.equal(summary.data.totalRenderedHours, 450);
    assert.equal(summary.data[department === 'ICS' ? 'ibe' : 'ics'].total, 0);
    const denied = await fixture.module('certificates').checkClearanceStatus(department === 'ICS' ? 's1' : 's0');
    assert.equal(denied.error.code, 'FORBIDDEN');
  }
});

test('missing, unknown, or unavailable OJT Coordinator grants fail closed before privileged reads', async () => {
  for (const department of [null, 'ALL', '']) {
    const fixture = workflowFixture('Coordinator', { tables: { staff_capability_grants: department === null ? [] : [{ user_id: 'actor', capability: 'academic_workflows', department_scope: department, revoked_at: null }] } });
    assert.equal((await fixture.module('progress').listCohortProgress()).error.code, 'FORBIDDEN');
    assert.equal((await fixture.module('progress').getDepartmentSummary()).error.code, 'FORBIDDEN');
    assert.equal((await fixture.module('certificates').checkClearanceStatus('student')).error.code, 'FORBIDDEN');
    assert.equal(fixture.serviceCalls, 0);
  }
  const fixture = workflowFixture('Coordinator', { fail: table => table === 'staff_capability_grants' ? 'offline' : null });
  assert.equal((await fixture.module('progress').getDepartmentSummary()).error.code, 'FORBIDDEN');
  assert.equal(fixture.serviceCalls, 0);
});

test('dual-department OJT Coordinator announcements reach the selected department', async () => {
  const fixture = workflowFixture('Coordinator', { tables: {
    users: [
      { user_id: 'actor', role: 'Coordinator', account_status: 'active' },
      { user_id: 'ics-student', role: 'Student', account_status: 'active' },
      { user_id: 'ibe-student', role: 'Student', account_status: 'active' },
    ],
    staff_capability_grants: ['ICS', 'IBE'].map(department_scope => ({
      user_id: 'actor', capability: 'academic_workflows', department_scope, revoked_at: null,
    })),
    students: [
      { user_id: 'ics-student', course: 'BSIT' },
      { user_id: 'ibe-student', course: 'BSENTREP' },
    ],
  } });
  const announcements = fixture.module('announcements');
  assert.equal((await announcements.createAnnouncement({ title: 'Update', content: 'News', target_department: 'IBE' })).error, null);
  assert.deepEqual(fixture.tables.notifications.map(row => row.receiver_user_id).sort(), ['actor', 'ibe-student']);
  assert.equal((await announcements.createAnnouncement({ title: 'Update', content: 'News' })).error.code, 'VALIDATION_FAILURE');
});

test('OJT Coordinator without an active department grant cannot provision supervisors', async () => {
  const fixture = workflowFixture('Coordinator', { tables: { staff_capability_grants: [] } });
  const result = await fixture.module('supervisors').createSupervisor({
    full_name: 'Supervisor', email: 'supervisor@example.test', company_id: 'company-1', position: 'Mentor',
  });
  assert.equal(result.error.code, 'FORBIDDEN');
  assert.equal(fixture.serviceCalls, 0);
});

test('cohort pagination rejects invalid bounds and summaries do not truncate after 200 records', async () => {
  const fixture = workflowFixture('Coordinator', { tables: { students: Array.from({ length: 401 }, (_, i) => ({ student_id: `s${i}`, course: 'BSIT', users: { account_status: 'active' } })) } });
  for (const [page, size] of [[0, 20], [1, 0], [1, 201], [NaN, 20], [1.5, 20]]) {
    assert.equal((await fixture.module('progress').listCohortProgress(page, size)).error.code, 'VALIDATION_FAILURE');
  }
  assert.equal((await fixture.module('progress').getDepartmentSummary()).data.totalStudents, 401);
});

test('final grade cannot bypass unmet clearance requirements', async () => {
  const fixture = workflowFixture('Coordinator', { tables: { students: [{ student_id: 'student', course: 'BSIT', required_hours: 486, users: { full_name: 'Student' } }] } });
  const service = fixture.module('certificates');
  for (const grade of [0.99, 5.01, 2.345, NaN]) {
    assert.equal((await service.recordFinalOjtGrade('student', grade, '2026-2027')).error.code, 'VALIDATION_FAILURE');
  }
  const result = await service.recordFinalOjtGrade('student', 1.75, '2026-2027');
  assert.equal(result.error.code, 'VALIDATION_FAILURE');
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.events.length, 0);
});

test('failing grade is recorded without completion; passing grade finalizes and issues a certificate', async () => {
  const fixture = workflowFixture('Coordinator', { tables: {
    students: [{ student_id: 'student', user_id: 'student-user', course: 'BSIT', required_hours: 486, users: { full_name: 'Student' } }],
    internship_progress: [{ student_id: 'student', completed_hours: 486 }],
    reports: [{ student_id: 'student', report_type: 'final_report', status: 'approved' }],
    evaluations: [{ evaluation_id: 'midterm', student_id: 'student', evaluation_type: 'midterm', performance_score: 90 }, { evaluation_id: 'final', student_id: 'student', evaluation_type: 'final', performance_score: 90 }],
    evaluation_appeals: [], certificates: [], ojt_final_grades: [],
  } });
  const service = fixture.module('certificates');
  for (const academicYear of ['', '2026', '2026-2028', 'not a year']) {
    const invalid = await service.recordFinalOjtGrade('student', 3, academicYear);
    assert.equal(invalid.error.code, 'VALIDATION_FAILURE');
  }
  assert.equal(fixture.writes.length, 0);
  const failing = await service.recordFinalOjtGrade('student', 3.01);
  assert.equal(failing.data.final_grade, 3.01);
  assert.equal(failing.data.verification_code, null);
  assert.equal(fixture.tables.ojt_final_grades[0].final_grade, 3.01);
  assert.equal(fixture.tables.certificates.length, 0);
  assert.equal((await service.checkClearanceStatus('student')).data.final_grade, 3.01);
  const passing = await service.recordFinalOjtGrade('student', 3, '2026–2027');
  assert.equal(passing.error, null);
  assert.equal(passing.data.final_grade, 3);
  assert.match(passing.data.verification_code, new RegExp(`^CDM-OJT-${new Date().getFullYear()}-`));
  assert.equal(fixture.tables.certificates.length, 1);
  assert.equal(fixture.tables.certificates[0].academic_year, '2026-2027');
  assert.equal(fixture.events.some(event => event.action === 'CERTIFICATE_ISSUED'), true);
});

test('completion requires both passing Supervisor evaluations and no pending appeal', async () => {
  const fixture = workflowFixture('Coordinator', { tables: {
    students: [{ student_id: 'student', user_id: 'student-user', course: 'BSIT', required_hours: 486, users: { full_name: 'Student' } }],
    internship_progress: [{ student_id: 'student', completed_hours: 486 }],
    reports: [{ student_id: 'student', report_type: 'final_report', status: 'approved' }],
    evaluations: [{ evaluation_id: 'midterm', student_id: 'student', evaluation_type: 'midterm', performance_score: 90 }, { evaluation_id: 'final', student_id: 'student', evaluation_type: 'final', performance_score: 90 }],
    evaluation_appeals: [],
    certificates: [],
  } });
  const service = fixture.module('certificates');
  fixture.tables.evaluations.pop();
  assert.equal((await service.checkClearanceStatus('student')).data.can_issue, false);
  fixture.tables.evaluations.push({ evaluation_id: 'final', student_id: 'student', evaluation_type: 'final', performance_score: 74.99 });
  assert.equal((await service.checkClearanceStatus('student')).data.can_issue, false);
  fixture.tables.evaluations[1].performance_score = 90;
  fixture.tables.evaluation_appeals.push({ evaluation_id: 'final', student_id: 'student', status: 'pending' });
  assert.equal((await service.checkClearanceStatus('student')).data.can_issue, false);
  fixture.tables.evaluation_appeals[0].status = 'upheld';
  assert.equal((await service.checkClearanceStatus('student')).data.can_issue, true);
});

test('department report loads the complete cohort and rejects incomplete results instead of exporting a partial report', async () => {
  const fixture = workflowFixture('Coordinator', { tables: {
    students: Array.from({ length: 401 }, (_, i) => ({ student_id: `s${i}`, course: 'BSIT', users: { account_status: 'active' } })),
  } });
  const service = fixture.module('progress');
  const mocks = {
    'next/navigation': { redirect() { throw new Error('Unexpected redirect'); } },
    '@/src/lib/supabase/server': { createClient: async () => fixture.client },
    '@/src/lib/supabase/service': { getServiceClient: () => fixture.service },
    '@/src/services/progress': service,
    './DepartmentReportsClient': () => null,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  };
  const file = 'apps/web/app/(dashboard)/coordinator/reports/page.tsx';
  const rendered = await load(file, mocks).default();
  assert.equal(rendered.props.initialStudents.length, 401);
  assert.equal(new Set(rendered.props.initialStudents.map(s => s.student_id)).size, 401);
  assert.equal(rendered.props.summary.totalStudents, 401);
  mocks['@/src/services/progress'] = { ...service, listCohortProgress: async (page, size) => page === 2 ? { data: null, error: { message: 'offline' } } : service.listCohortProgress(page, size) };
  await assert.rejects(() => load(file, mocks).default(), /fully loaded/);
});

test('OJT Coordinator approvals, grading, assignments, and schedule reviews reject other departments before writes', async () => {
  for (const department of ['ICS', 'IBE']) {
    const fixture = workflowFixture('Coordinator', { tables: {
      staff_capability_grants: [{ user_id: 'actor', capability: 'academic_workflows', department_scope: department, revoked_at: null }],
      students: [{ student_id: 'foreign', user_id: 'foreign-user', course: department === 'ICS' ? 'BSENTREP' : 'BSIT' }],
      reports: [{ report_id: 'report', student_id: 'foreign', status: 'submitted' }],
      evaluations: [{ evaluation_id: 'evaluation', student_id: 'foreign', performance_score: 60 }],
      student_assignments: [{ assignment_id: 'assignment', student_id: 'foreign', assignment_status: 'active' }],
      practicum_schedules: [{ schedule_id: 'schedule', student_id: 'foreign', status: 'pending' }],
    } });
    const calls = [
      ['auth', 'updateStudentAccountStatus', ['foreign-user', 'active']],
      ['reports', 'reviewReport', ['report', 'approved']],
      ['reports', 'sendRequirementReminder', ['foreign-user', ['Report']]],
      ['evaluations', 'overrideEvaluation', ['evaluation', 90, 'Review']],
      ['assignments', 'createAssignment', [{ student_id: 'foreign', company_id: 'company', supervisor_id: 'supervisor', start_date: '2026-10-06' }]],
      ['assignments', 'updateAssignmentStatus', ['assignment', 'completed']],
      ['assignments', 'updateStudentStatus', ['foreign', 'dropped']],
      ['assignments', 'reassignStudent', ['foreign', 'company', 'supervisor', '2026-10-06']],
      ['schedule', 'reviewPracticumSchedule', ['schedule', 'approve']],
    ];
    for (const [module, method, args] of calls) {
      assert.equal((await fixture.module(module)[method](...args)).error.code, 'FORBIDDEN', `${department} ${method}`);
    }
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.events.length, 0);
    assert.equal(fixture.serviceCalls, 0);
  }
});

test('OJT Coordinator can approve, assign, and review their department without mutating original evaluations', async () => {
  for (const department of ['ICS', 'IBE']) {
    const fixture = workflowFixture('Coordinator', { tables: {
      users: [{ user_id: 'actor', role: 'Coordinator', account_status: 'active' }, { user_id: 'student-user', role: 'Student', account_status: 'pending', full_name: 'Student', email: 'student@example.test' }],
      staff_capability_grants: [{ user_id: 'actor', capability: 'academic_workflows', department_scope: department, revoked_at: null }],
      students: [{ student_id: 'own', user_id: 'student-user', course: department === 'ICS' ? 'BSIT' : 'BSENTREP' }],
      reports: [{ report_id: 'report', student_id: 'own', report_type: 'Pre-OJT Orientation Certificate', status: 'submitted' }],
      evaluations: [{ evaluation_id: 'evaluation', student_id: 'own', performance_score: 60 }],
      supervisors: [{ supervisor_id: 'supervisor', company_id: 'company' }],
      practicum_schedules: [{ schedule_id: 'schedule', student_id: 'own', status: 'pending' }],
    } });
    assert.equal((await fixture.module('auth').updateStudentAccountStatus('student-user', 'active')).error, null);
    assert.equal((await fixture.module('reports').reviewReport('report', 'approved')).error, null);
    assert.equal((await fixture.module('evaluations').overrideEvaluation('evaluation', 90, 'Review')).error.code, 'VALIDATION_FAILURE');
    assert.equal((await fixture.module('assignments').createAssignment({ student_id: 'own', company_id: 'company', branch_id: 'branch', supervisor_id: 'supervisor', start_date: '2026-10-06' })).error, null);
    assert.equal((await fixture.module('schedule').reviewPracticumSchedule('schedule', 'approve', {
      company_id: 'company', branch_id: 'branch', supervisor_id: 'supervisor', start_date: '2026-10-06',
    })).error, null);
    assert.equal(fixture.tables.users[1].account_status, 'active');
    assert.equal(fixture.tables.reports[0].status, 'approved');
    assert.equal(fixture.tables.evaluations[0].performance_score, 60);
    assert.equal(fixture.tables.student_assignments[0].student_id, 'own');
    assert.equal(fixture.tables.practicum_schedules[0].status, 'approved');
  }
});

test('OJT Coordinator sets only DROPPED, INC, or TERMINATED on an unfinalized department student, with an audit event', async () => {
  const fixture = workflowFixture('Coordinator', { tables: {
    students: [{ student_id: 'own', user_id: 'student-user', course: 'BSIT', status: 'active' },
      { student_id: 'done', user_id: 'done-user', course: 'BSIT', status: 'active' }],
    certificates: [{ student_id: 'done' }],
  } });
  const assignments = fixture.module('assignments');
  for (const status of ['dropped', 'inc', 'terminated']) {
    assert.equal((await assignments.updateStudentStatus('own', status)).error, null, status);
    assert.equal(fixture.tables.students[0].status, status);
    assert.equal(fixture.events.at(-1).action, `STUDENT_STATUS_${status.toUpperCase()}`);
  }
  const writes = fixture.writes.length;
  for (const status of ['completed', 'active', 'bogus'])
    assert.equal((await assignments.updateStudentStatus('own', status)).error.code, 'VALIDATION_FAILURE', status);
  assert.equal((await assignments.updateStudentStatus('done', 'dropped')).error.code, 'VALIDATION_FAILURE');
  assert.equal(fixture.tables.students[1].status, 'active');
  assert.equal(fixture.writes.length, writes);
  assert.equal(fixture.events.length, 3);
});

test('web schedule insert persists the policy-normalized lunch interval', async () => {
  const fixture = workflowFixture('Student', { tables: {
    students: [{ student_id: 'student', user_id: 'actor' }],
  } });
  const result = await fixture.module('schedule').submitPracticumSchedule({
    work_days: [1, 2, 3, 4, 5], time_in: '08:00', time_out: '17:00',
    lunch_break_minutes: undefined, lunch_break_start: '12:00', start_date: '2026-10-12',
    work_modality: 'onsite',
  });
  assert.equal(result.error, null);
  const inserted = fixture.tables.practicum_schedules?.[0];
  assert.equal(inserted.lunch_break_minutes, 60);
  assert.equal(inserted.lunch_break_start, '12:00');
  assert.equal(inserted.daily_hours, 8);
});

test('evaluation summaries deny cross-department and unassigned reads before service-role access', async () => {
  const head = workflowFixture('Coordinator', { tables: {
    students: [{ student_id: 'foreign', course: 'BSENTREP' }],
  } });
  assert.equal((await head.module('evaluations').getStudentEvaluationSummary('foreign')).error.code, 'FORBIDDEN');
  assert.equal(head.serviceCalls, 0);
  const supervisor = workflowFixture('Supervisor', { tables: {
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [{ student_id: 'foreign', supervisor_id: 'other', assignment_status: 'active' }],
  } });
  assert.equal((await supervisor.module('evaluations').getStudentEvaluationSummary('foreign')).error.code, 'FORBIDDEN');
  assert.equal(supervisor.serviceCalls, 0);
  const own = workflowFixture('Student', { tables: { students: [{ user_id: 'actor', student_id: 'own', course: 'BSIT', users: { full_name: 'Self' } }] } });
  assert.equal((await own.module('evaluations').getStudentEvaluationSummary('foreign')).data.student_id, 'own');
});

test('installer downloads allow only known filenames and reject traversal before filesystem access', async () => {
  let probes = 0;
  const route = load('apps/web/app/downloads/[filename]/route.ts', { fs: {
    existsSync() { probes++; return true; },
    statSync() { return { size: 4, isFile: () => true }; },
    createReadStream() { return require('node:stream').Readable.from([Buffer.from('MZok')]); },
  } });
  for (const filename of ['nonexistent.exe', '../cdm.env', '../../secret.exe', 'cdm.txt']) {
    const result = await route.GET(new Request('http://localhost/downloads/test'), { params: Promise.resolve({ filename }) });
    assert.equal(result.status, 404);
  }
  assert.equal(probes, 0);
  const result = await route.GET(new Request('http://localhost/downloads/test'), { params: Promise.resolve({ filename: 'CdM-OJT-Portal-Setup-1.0.0.exe' }) });
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'MZok');
  assert.equal(result.headers.get('content-length'), '4');
});

test('clearance details require authentication and students can read only their own record', async () => {
  const anonymous = workflowFixture(null);
  assert.equal((await anonymous.module('certificates').checkClearanceStatus('student')).error.code, 'FORBIDDEN');
  assert.equal(anonymous.serviceCalls, 0);
  const fixture = workflowFixture('Student', { tables: { students: [
    { student_id: 'own', user_id: 'actor', student_number: '1', course: 'BSIT', users: { full_name: 'Self' } },
    { student_id: 'foreign', user_id: 'other', student_number: '2', course: 'BSIT', users: { full_name: 'Other' } },
  ] } });
  assert.equal((await fixture.module('certificates').checkClearanceStatus('foreign')).error.code, 'FORBIDDEN');
  assert.equal(fixture.serviceCalls, 0);
  const own = await fixture.module('certificates').checkClearanceStatus('own');
  assert.equal(own.error, null);
  assert.equal(own.data.student_name, 'Self');
});

test('evaluation rejects invalid numeric scores and out-of-range rubric entries before saving', async () => {
  const fixture = workflowFixture('Supervisor');
  for (const performance_score of [NaN, Infinity, -1, 101, '75']) {
    const result = await fixture.module('evaluations').createEvaluation({ student_id: 'student', feedback: 'Feedback', performance_score });
    assert.equal(result.error.code, 'VALIDATION_FAILURE');
  }
  const result = await fixture.module('evaluations').createEvaluation({ student_id: 'student', feedback: 'Feedback', performance_score: null,
    criteria: { technical_competence: 26, productivity_dependability: 20, attendance_punctuality: 20, communication_skills: 15, work_ethics_professionalism: 19 } });
  assert.equal(result.error.code, 'VALIDATION_FAILURE');
  assert.equal(fixture.writes.length, 0);
});

test('evaluation uses a 5-point rating per criterion and requires a comment for any rating below 3', async () => {
  const fixture = workflowFixture('Supervisor', { tables: {
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [{ student_id: 'student', supervisor_id: 'supervisor', assignment_id: 'assignment', assignment_status: 'active' }],
  } });
  const evaluations = fixture.module('evaluations');
  const ratings = { technical_competence: 5, productivity_dependability: 4, attendance_punctuality: 4, communication_skills: 3, work_ethics_professionalism: 5 };
  for (const bad of [0, 6, 2.5, '4', NaN])
    assert.equal((await evaluations.createEvaluation({ student_id: 'student', evaluation_type: 'midterm', performance_score: null, feedback: 'Fine', criteria: { ...ratings, communication_skills: bad } })).error.code, 'VALIDATION_FAILURE');
  assert.equal((await evaluations.createEvaluation({ student_id: 'student', evaluation_type: 'midterm', performance_score: 99, feedback: 'No rubric' })).error.code, 'VALIDATION_FAILURE');
  const low = { ...ratings, attendance_punctuality: 2 };
  const missing = await evaluations.createEvaluation({ student_id: 'student', evaluation_type: 'midterm', performance_score: null, feedback: '   ', criteria: low });
  assert.equal(missing.error.code, 'VALIDATION_FAILURE');
  assert.match(missing.error.message, /below 3/);
  assert.equal(fixture.writes.length, 0);

  assert.equal((await evaluations.createEvaluation({ student_id: 'student', evaluation_type: 'midterm', performance_score: null, feedback: '', criteria: ratings })).error, null);
  assert.equal((await evaluations.createEvaluation({ student_id: 'student', evaluation_type: 'final', performance_score: null, feedback: 'Often late in week 3.', criteria: low })).error, null);
  const [midterm, final] = fixture.tables.evaluations;
  // stored as weighted points (25/20/20/15/20) so summaries, grades and appeals keep the 100-point scale
  assert.deepEqual({ ...midterm.rubric_scores }, { technical_competence: 25, productivity_dependability: 16, attendance_punctuality: 16, communication_skills: 9, work_ethics_professionalism: 20 });
  assert.equal(midterm.performance_score, 86);
  assert.equal(midterm.feedback, '');
  assert.equal(final.performance_score, 78);
});

test('modal traps keyboard focus, closes on Escape, and restores focus and scroll state', () => {
  const refs = [], effects = [];
  let onKey, closed = 0;
  const doc = { body: { style: { overflow: 'auto' } },
    addEventListener(_type, handler) { onKey = handler; }, removeEventListener() { onKey = null; } };
  const element = () => ({ isConnected: true, getClientRects: () => [1], focus() { doc.activeElement = this; } });
  const trigger = element(), first = element(), last = element();
  doc.activeElement = trigger;
  const dialog = { ...element(), querySelectorAll: () => [first, last], contains: item => [first, last, dialog].includes(item) };
  const jsx = (type, props) => ({ type, props });
  const Modal = load('apps/web/src/components/ui/Modal.tsx', {
    react: { useEffect: fn => effects.push(fn), useRef: initial => { const ref = { current: initial }; refs.push(ref); return ref; }, useState: () => [true, () => {}], useId: () => 'dialog-title' },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-dom': { createPortal: value => value },
  }, {}, { document: doc }).default;
  const output = Modal({ title: 'Confirm', open: true, onClose: () => closed++, children: 'Body' });
  refs[1].current = dialog;
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  assert.equal(output.props.children.props.role, 'dialog');
  assert.equal(doc.activeElement, first);
  assert.equal(doc.body.style.overflow, 'hidden');
  last.focus();
  onKey({ key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(doc.activeElement, first);
  onKey({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(doc.activeElement, last);
  onKey({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1);
  cleanups.forEach(cleanup => cleanup());
  assert.equal(doc.activeElement, trigger);
  assert.equal(doc.body.style.overflow, 'auto');
});

test('batch attendance verification changes only requested pending records assigned to the supervisor', async () => {
  const fixture = workflowFixture('Supervisor', { tables: {
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [{ student_id: 'own-student', supervisor_id: 'supervisor', assignment_status: 'active' }],
    attendance: [
      { attendance_id: attendanceId(1), student_id: 'own-student', verification_status: 'pending' },
      { attendance_id: attendanceId(2), student_id: 'own-student', verification_status: 'pending' },
      { attendance_id: attendanceId(3), student_id: 'other-student', verification_status: 'pending' },
      { attendance_id: attendanceId(4), student_id: 'own-student', verification_status: 'rejected' },
    ],
  } });
  const result = await fixture.module('attendance').batchVerifyAttendance([attendanceId(1), attendanceId(3), attendanceId(4)]);
  assert.equal(result.data.verifiedCount, 1);
  assert.deepEqual(fixture.tables.attendance.map(row => row.verification_status), ['verified', 'pending', 'pending', 'rejected']);
  assert.equal(fixture.events.length, 1);
  assert.equal((await fixture.module('attendance').batchVerifyAttendance([])).error.code, 'VALIDATION_FAILURE');
  assert.equal((await fixture.module('attendance').batchVerifyAttendance(Array(21).fill(attendanceId(1)))).error.code, 'VALIDATION_FAILURE');
});

test('a concurrent attendance decision cannot be overwritten by a stale verification', async () => {
  const fixture = workflowFixture('Supervisor', { tables: {
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [{ assignment_id: 'assignment', student_id: 'student', supervisor_id: 'supervisor', assignment_status: 'active' }],
    attendance: [{ attendance_id: attendanceId(1), student_id: 'student', verification_status: 'pending' }],
  }, beforeUpdate(table, tables) { if (table === 'attendance') tables.attendance[0].verification_status = 'rejected'; } });
  const result = await fixture.module('attendance').verifyAttendance(attendanceId(1), 'verified');
  assert.equal(result.error.code, 'DUPLICATE_REQUEST');
  assert.equal(fixture.tables.attendance[0].verification_status, 'rejected');
});

test('only the assigned active supervisor can mark attendance verified or disputed', async () => {
  const tables = () => ({
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [
      { assignment_id: 'a1', student_id: 'own', supervisor_id: 'supervisor', assignment_status: 'active' },
      { assignment_id: 'a2', student_id: 'past', supervisor_id: 'supervisor', assignment_status: 'completed' },
    ],
    attendance: [
      { attendance_id: attendanceId(1), student_id: 'own', verification_status: 'pending' },
      { attendance_id: attendanceId(2), student_id: 'own', verification_status: 'pending' },
      { attendance_id: attendanceId(3), student_id: 'other', verification_status: 'pending' },
      { attendance_id: attendanceId(4), student_id: 'past', verification_status: 'pending' },
    ],
  });
  const fixture = workflowFixture('Supervisor', { tables: tables() });
  const service = fixture.module('attendance');
  assert.equal((await service.verifyAttendance(attendanceId(1), 'verified')).error, null);
  // DISPUTED in the spec is stored as verification_status 'rejected'.
  assert.equal((await service.verifyAttendance(attendanceId(2), 'rejected')).error, null);
  assert.equal((await service.verifyAttendance(attendanceId(3), 'rejected')).error.code, 'FORBIDDEN');
  assert.equal((await service.verifyAttendance(attendanceId(4), 'verified')).error.code, 'FORBIDDEN');
  assert.equal((await service.verifyAttendance(attendanceId(1), 'rejected')).error.code, 'DUPLICATE_REQUEST');
  assert.equal((await service.verifyAttendance(attendanceId(3), 'approved')).error.code, 'VALIDATION_FAILURE');
  assert.deepEqual(fixture.tables.attendance.map(row => row.verification_status), ['verified', 'rejected', 'pending', 'pending']);

  const inactive = workflowFixture('Supervisor', { status: 'inactive', tables: tables() });
  assert.equal((await inactive.module('attendance').verifyAttendance(attendanceId(1), 'verified')).error.code, 'FORBIDDEN');
  assert.equal(inactive.tables.attendance[0].verification_status, 'pending');
  const coordinator = workflowFixture('Coordinator', { tables: tables() });
  assert.equal((await coordinator.module('attendance').verifyAttendance(attendanceId(1), 'verified')).error.code, 'FORBIDDEN');
});

test('supervisor disputes via "Mark Disputed" but the stored rejected status keeps its Rejected label', () => {
  // 'rejected' is also a Coordinator exception rejection, so only the Supervisor action says Disputed.
  const page = fs.readFileSync(path.join(root, 'apps/web/app/(dashboard)/supervisor/attendance/page.tsx'), 'utf8');
  assert.match(page, /onClick=\{\(\) => handleVerify\('rejected'\)\}[\s\S]{0,300}Mark Disputed/);
  assert.match(page, /label: 'Rejected', value: 'rejected'/);
  assert.doesNotMatch(page, /'Disputed'|Reject Record/);
  assert.doesNotMatch(page, /<Badge status=\{[^}]*verification_status\}>/);
});

test('Coordinator attendance exceptions use one audited database decision', async () => {
  let call = null;
  const fixture = workflowFixture('Coordinator', { rpc(name, args) {
    if (name === 'coordinator_decide_attendance_exception') {
      call = { name, args };
      return { data: attendanceId(8), error: null };
    }
  } });
  const result = await fixture.module('attendance').coordinatorOverrideVerifyAttendance(
    attendanceId(8), 'verified', 'Supervisor unavailable; evidence reviewed.'
  );
  assert.equal(result.error, null);
  assert.equal(JSON.stringify(call), JSON.stringify({ name: 'coordinator_decide_attendance_exception', args: {
    p_attendance_id: attendanceId(8), p_verification_status: 'verified',
    p_override_reason: 'Supervisor unavailable; evidence reviewed.',
  } }));
  assert.equal(fixture.events.length, 0, 'the database transaction writes its own required audit record');
});

test('Coordinator attendance exception reports a failed decision and audit transaction', async () => {
  const fixture = workflowFixture('Coordinator', { rpc(name) {
    return name === 'coordinator_decide_attendance_exception'
      ? { data: null, error: { code: 'XX000', message: 'audit insert failed' } }
      : undefined;
  } });
  const result = await fixture.module('attendance').coordinatorOverrideVerifyAttendance(
    attendanceId(8), 'rejected', 'Evidence does not support this attendance event.'
  );
  assert.equal(result.error.code, 'SERVER_FAILURE');
  assert.match(result.error.message, /apply and audit/);
  assert.equal(fixture.events.length, 0);
});

test('student approval cannot change staff accounts or overwrite an earlier decision', async () => {
  const fixture = workflowFixture('Coordinator');
  fixture.tables.users.push(
    { user_id: 'admin-target', role: 'Admin', account_status: 'pending' },
    { user_id: 'student-target', role: 'Student', account_status: 'pending', email: 'test@example.invalid' },
  );
  fixture.tables.students = [{ student_id: 'student-target-id', user_id: 'student-target', course: 'BSIT' }];
  const auth = fixture.module('auth');
  assert.equal((await auth.updateStudentAccountStatus('admin-target', 'active')).error.code, 'FORBIDDEN');
  assert.equal(fixture.tables.users[1].account_status, 'pending');
  const approval = await auth.updateStudentAccountStatus('student-target', 'active');
  assert.equal(approval.error, null);
  assert.equal(approval.data.emailQueued, true);
  assert.equal((await auth.updateStudentAccountStatus('student-target', 'rejected')).error.code, 'NOT_FOUND');
  assert.equal(fixture.tables.users[2].account_status, 'active');
  assert.equal(fixture.emailCount, 0);
  assert.equal((await auth.updateStudentAccountStatus('student-target', 'inactive')).error.code, 'VALIDATION_FAILURE');
});

test('duplicate Supabase signup identities are not deleted or persisted as new students', async () => {
  const fixture = workflowFixture(null, { signupResponse: { data: { user: { id: 'existing-user', identities: [] }, session: null }, error: null } });
  const idToken = 'abcdef0123456789abcdef01';
  const result = await fixture.module('auth').registerStudent({ full_name: 'Test Person', email: 'known@example.invalid', password: 'LongPassword123!', student_number: 'TEST-100', course: 'BSIT', year_level: 4,
    id_card_front_path: `id-cards/123456789012_${idToken}_front.jpg`, id_card_back_path: `id-cards/123456789012_${idToken}_back.jpg` });
  assert.equal(result.error.code, 'DUPLICATE_REQUEST');
  assert.doesNotMatch(result.error.message, /known@example.invalid/);
  assert.equal(fixture.deleted, 0);
  assert.equal(fixture.writes.some(write => write.table === 'students' && write.op === 'upsert'), false);
});

test('student approval requires a verified email before activation', async () => {
  const fixture = workflowFixture('Coordinator', { unconfirmedUsers: ['student-target'] });
  fixture.tables.users.push({ user_id: 'student-target', role: 'Student', account_status: 'pending', email: 'test@example.invalid' });
  fixture.tables.students = [{ student_id: 'student-target-id', user_id: 'student-target', course: 'BSIT' }];
  const result = await fixture.module('auth').updateStudentAccountStatus('student-target', 'active');
  assert.equal(result.error.code, 'FORBIDDEN');
  assert.equal(fixture.tables.users[1].account_status, 'pending');
  assert.equal(fixture.writes.some(write => write.table === 'users' && write.op === 'update'), false);
});

test('coordinator invitation rolls back failed profile writes and activates only complete accounts', async () => {
  for (const failingWrite of [['users','update'], ['coordinators','insert'], null]) {
    const fixture = workflowFixture('Admin', { fail: (table, op) => table === failingWrite?.[0] && op === failingWrite?.[1] ? 'write failed' : null });
    const result = await fixture.module('admin').createSystemUser({ full_name: 'Test Coordinator', email: 'staff@example.invalid', role: 'OJT Coordinator', department_scopes: ['ICS'] });
    if (failingWrite) {
      assert.equal(result.error.code, 'SERVER_FAILURE');
      assert.equal(fixture.deleted, 1);
      assert.equal(fixture.tables.users.some(row => row.user_id === 'new-user'), false);
      assert.equal(fixture.events.length, 0);
    } else {
      assert.equal(result.error, null);
      assert.equal(fixture.tables.users.find(row => row.user_id === 'new-user').account_status, 'active');
      assert.equal(fixture.tables.coordinators.length, 1);
      assert.equal(fixture.tables.staff_capability_grants.length, 2);
    }
  }
});

test('administrator cannot disable their own account or report success for a missing user', async () => {
  const fixture = workflowFixture('Admin');
  assert.equal((await fixture.module('admin').updateUserAccountStatus('actor', 'inactive')).error.code, 'VALIDATION_FAILURE');
  assert.equal(fixture.tables.users[0].account_status, 'active');
  assert.equal((await fixture.module('admin').updateUserAccountStatus('missing', 'active')).error.code, 'NOT_FOUND');
  assert.equal(fixture.events.length, 0);
});

test('Super Admin cannot deactivate a Coordinator who still has active students in their department', async () => {
  const coordinator = (id, department) => [
    { user_id: id, role: 'Coordinator', account_status: 'active', full_name: id, email: `${id}@example.test` },
    { user_id: id, capability: 'academic_workflows', department_scope: department, revoked_at: null },
  ];
  const [icsUser, icsGrant] = coordinator('co-ics', 'ICS');
  const [ibeUser, ibeGrant] = coordinator('co-ibe', 'IBE');
  const fixture = workflowFixture('Admin', { tables: {
    staff_capability_grants: [icsGrant, ibeGrant],
    students: [
      { student_id: 's-ics', course: 'BSIT', student_assignments: { assignment_status: 'active' } },
      { student_id: 's-ibe', course: 'BSBA', student_assignments: { assignment_status: 'completed' } },
    ],
  } });
  fixture.tables.users.push(icsUser, ibeUser);
  const admin = fixture.module('admin');
  for (const result of [await admin.deactivateSystemUser('co-ics'), await admin.updateUserAccountStatus('co-ics', 'inactive')]) {
    assert.equal(result.error?.code, 'FORBIDDEN');
    assert.match(result.error.message, /active student/i);
  }
  assert.equal(icsUser.account_status, 'active');
  assert.equal((await admin.deactivateSystemUser('co-ibe')).error, null, 'completed placements do not block');
  assert.equal(ibeUser.account_status, 'inactive');
});

test('Super Admin actions require an AAL2 session before service-role access', async () => {
  const fixture = workflowFixture('Admin', { aal: 'aal1' });
  const result = await fixture.module('admin').listAllUsers();
  assert.equal(result.error.code, 'FORBIDDEN');
  assert.equal(fixture.serviceCalls, 0);
});

test('local Super Admin MFA can be enrolled without browser OTP autofill', () => {
  const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  const totpConfig = config.match(/\[auth\.mfa\.totp\]([\s\S]*?)(?=\n\[|\s*$)/)?.[1];
  assert.match(totpConfig || '', /^\s*enroll_enabled\s*=\s*true\s*$/m);
  assert.match(totpConfig || '', /^\s*verify_enabled\s*=\s*true\s*$/m);

  const gate = fs.readFileSync(path.join(root, 'apps/web/app/(dashboard)/admin/AdminMfaGate.tsx'), 'utf8');
  assert.doesNotMatch(gate, /autoComplete=["']one-time-code["']/);
  const prepareStart = gate.indexOf('async function prepareFactor()');
  const prepareEnd = gate.indexOf('prepareFactor().catch', prepareStart);
  assert.notEqual(prepareStart, -1);
  assert.notEqual(prepareEnd, -1);
  assert.doesNotMatch(gate.slice(prepareStart, prepareEnd), /auth\.mfa\.(?:enroll|unenroll)/);
  assert.match(gate, /factors\.all\.filter\(factor => factor\.factor_type === 'totp' && factor\.status === 'unverified'\)/);
  assert.match(gate, /onClick=\{startEnrollment\}/);
});

test('admin overview reports database failures instead of zero statistics', async () => {
  const fixture = workflowFixture('Admin', { fail: (table, _op, serviceOnly) => serviceOnly && table === 'users' ? 'database unavailable' : null });
  const result = await fixture.module('admin').getSystemOverview();
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'SERVER_FAILURE');
});

test('report review and endorsement fail when no accessible report was updated', async () => {
  for (const role of ['Coordinator', 'Supervisor']) {
    const fixture = workflowFixture(role);
    const reports = fixture.module('reports');
    const result = role === 'Coordinator' ? await reports.reviewReport('missing', 'approved')
      : await reports.endorseReportBySupervisor('missing', 'approved', 'Reviewed the weekly report.');
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(fixture.events.length, 0);
  }
});

test('Supervisors decide daily reports once and Coordinators cannot double-review them', async () => {
  const dailyReport = { report_id: 'daily-1', student_id: 'student-1', report_type: 'Daily Journal', status: 'submitted', supervisor_decision: null };
  const supervisor = workflowFixture('Supervisor', { tables: {
    reports: [dailyReport], supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor-1' }],
    student_assignments: [{ student_id: 'student-1', supervisor_id: 'supervisor-1', assignment_status: 'active' }],
  } });
  const review = await supervisor.module('reports').endorseReportBySupervisor('daily-1', 'approved', 'Tasks completed as reported.');
  assert.equal(review.error, null);
  assert.equal(supervisor.tables.reports[0].supervisor_decision, 'approved');
  assert.equal(supervisor.tables.reports[0].supervisor_decided_by, 'actor');
  assert.equal((await supervisor.module('reports').endorseReportBySupervisor('daily-1', 'returned', 'Second decision')).error.code, 'NOT_FOUND');
  assert.equal(supervisor.events.length, 1);

  const coordinator = workflowFixture('Coordinator', { tables: { reports: [dailyReport] } });
  const duplicateReview = await coordinator.module('reports').reviewReport('daily-1', 'approved');
  assert.equal(duplicateReview.error.code, 'FORBIDDEN');
  assert.equal(coordinator.tables.reports[0].status, 'submitted');
});

test('core student, OJT Coordinator, and supervisor service paths return useful results', async () => {
  const student = workflowFixture('Student', { tables: { students: [{ student_id: 'student', user_id: 'actor' }] } });
  assert.equal((await student.module('reports').submitReport({ report_type: 'Weekly Progress', file_path: 'actor/reports/00000000-0000-4000-8000-000000000001.pdf' })).error, null);
  assert.equal(student.tables.reports[0].student_id, 'student');

  const coordinator = workflowFixture('Coordinator', { tables: {
    students: [{ student_id: 'student', course: 'BSIT' }],
    supervisors: [{ supervisor_id: 'supervisor', company_id: 'company' }],
  } });
  const assignment = await coordinator.module('assignments').createAssignment({ student_id: 'student', supervisor_id: 'supervisor', company_id: 'company', branch_id: 'branch', start_date: '2026-10-05' });
  assert.equal(assignment.error, null);
  assert.equal(coordinator.tables.student_assignments[0].assignment_status, 'active');

  const supervisor = workflowFixture('Supervisor', { tables: {
    supervisors: [{ user_id: 'actor', supervisor_id: 'supervisor' }],
    student_assignments: [{ student_id: 'student', supervisor_id: 'supervisor', assignment_id: 'assignment', assignment_status: 'active' }],
  } });
  assert.equal((await supervisor.module('evaluations').createEvaluation({ student_id: 'student', performance_score: null, feedback: 'Good progress.', evaluation_type: 'midterm', criteria: { technical_competence: 5, productivity_dependability: 4, attendance_punctuality: 4, communication_skills: 4, work_ethics_professionalism: 4 } })).error, null);
  assert.equal(supervisor.tables.evaluations[0].performance_score, 85);

  const head = workflowFixture('Coordinator', { tables: { students: [{ student_id: 'student', course: 'BSIT', users: { account_status: 'active' }, internship_progress: { completed_hours: 120, progress_status: 'in_progress' } }] } });
  const summary = await head.module('progress').getDepartmentSummary();
  assert.equal(summary.error, null);
  assert.equal(summary.data.totalStudents, 1);
  assert.equal(summary.data.totalRenderedHours, 120);
});

test('course filtering happens before pending-student pagination and returns a filtered total', async () => {
  const fixture = workflowFixture('Coordinator');
  for (let index = 0; index < 30; index++) fixture.tables.users.push({
    user_id: `student-${index}`, role: 'Student', account_status: 'pending',
    students: { student_number: String(index), course: index < 20 ? 'BSIT' : 'BSENTREP', year_level: 4 },
  });
  const result = await fixture.module('auth').listPendingStudents(1, 5, 'BSENTREP');
  assert.equal(result.error, null);
  assert.equal(result.data.total, 10);
  assert.equal(result.data.students.length, 5);
  assert.equal(result.data.students.every(row => row.course === 'BSENTREP'), true);
});

test('role boundaries reject other roles, anonymous users, and inactive users before privileged service access', async () => {
  const cases = [
    ['admin', 'listAllUsers', [], ['Admin']],
    ['auth', 'listPendingStudents', [], ['Coordinator']],
    ['attendance', 'listAttendanceForSupervisor', [], ['Supervisor']],
    ['attendance', 'batchVerifyAttendance', [[attendanceId(1)]], ['Supervisor']],
    ['assignments', 'listAssignments', [], ['Coordinator']],
    ['companies', 'listCompanies', [], ['Coordinator']],
    ['evaluations', 'listEvaluationsForSupervisor', [], ['Supervisor']],
    ['progress', 'getDepartmentSummary', [], ['Coordinator']],
    ['reports', 'listStudentReports', [], ['Student']],
    ['reports', 'reviewReport', ['report', 'approved'], ['Coordinator']],
    ['reports', 'endorseReportBySupervisor', ['report', 'approved', 'Feedback'], ['Supervisor']],
    ['schedule', 'listPracticumSchedules', [], ['Coordinator']],
    ['announcements', 'createAnnouncement', [{ title: 'Test', content: 'Test' }], ['Coordinator', 'Admin']],
    ['certificates', 'checkClearanceStatus', ['student'], ['Student', 'Coordinator']],
    ['certificates', 'recordFinalOjtGrade', ['student', 1.75, '2026-2027'], ['Coordinator']],
    ['certificates', 'revokeCertificate', ['certificate', 'Reason'], ['Coordinator']],
    ['evaluations', 'listSubmittedEvaluations', [], ['Coordinator']],
    ['evaluations', 'overrideEvaluation', ['evaluation', 80, 'Reason'], ['Coordinator']],
    ['reports', 'sendRequirementReminder', ['student-user', ['Report']], ['Coordinator']],
    ['companies', 'setCompanyStatus', ['company', 'inactive'], ['Coordinator']],
    ['companies', 'getDeploymentMapData', [], ['Coordinator']],
  ];
  for (const [module, method, args, allowed] of cases) {
    for (const role of [null, 'Student', 'Supervisor', 'Coordinator', 'ProgramHead', 'Admin']) {
      for (const status of ['active', 'inactive']) {
        if (status === 'active' && allowed.includes(role)) continue;
        const fixture = workflowFixture(role, { status });
        const result = await fixture.module(module)[method](...args);
        assert.equal(result.error?.code, 'FORBIDDEN', `${role}/${status} must not call ${method}`);
        assert.equal(fixture.serviceCalls, 0, `${method} must stop before service-role access`);
        assert.equal(fixture.writes.length, 0);
      }
    }
  }
});

function load(relative, mocks = {}, env = {}, globals = {}) {
  const filename = path.resolve(root, relative);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, Buffer, File, FormData, Date, URL, URLSearchParams, Request, Response, AbortSignal, TextDecoder,
    setTimeout: globals.setTimeout || setTimeout, clearTimeout: globals.clearTimeout || clearTimeout,
    __DEV__: globals.__DEV__ || false, process: { env, cwd: () => path.join(root, 'apps/web') },
    document: globals.document,
    console: globals.console || console,
    fetch: globals.fetch || fetch,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name === '@ojt/shared') return load('shared/index.ts', mocks, env, globals);
      if (name.startsWith('@/src/')) return load(path.join('apps/web/src', name.slice('@/src/'.length) + '.ts'), mocks, env, globals);
      if (name.startsWith('.')) {
        let target = path.resolve(path.dirname(filename), name);
        if (!path.extname(target)) target += '.ts';
        return load(path.relative(root, target), mocks, env, globals);
      }
      if (name === '@/src/lib/supabase/public-url') return load('apps/web/src/lib/supabase/public-url.ts');
      if (name === '@/src/lib/department-scope') return load('apps/web/src/lib/department-scope.ts', { 'server-only': {} });
      if (name === '@/src/lib/uploadValidation')
        return load('apps/web/src/lib/uploadValidation.ts');
      return require(name);
    },
  }, { filename });
  return exports;
}

test('trusted web actor requires an active public profile matching the Auth user', async () => {
  let authUser = { id: 'actor' };
  let profile = { user_id: 'actor', role: 'Student', account_status: 'active' };
  let profileError = null;
  const supabase = {
    auth: { async getUser() { return { data: { user: authUser }, error: null }; }, mfa: { async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal2' }, error: null }; } } },
    from(table) {
      assert.equal(table, 'users');
      return {
        select() { return this; }, eq(_column, id) { this.id = id; return this; },
        async maybeSingle() { return { data: profile, error: profileError }; },
      };
    },
  };
  const { getTrustedActor } = load('apps/web/src/lib/trusted-actor.ts', {
    'server-only': {}, '@/src/lib/supabase/server': { async createClient() { return supabase; } },
  });
  assert.equal((await getTrustedActor()).user.id, 'actor');
  profile = { ...profile, user_id: 'another-user' };
  assert.equal((await getTrustedActor()).user, null);
  profile = { ...profile, user_id: 'actor', account_status: 'pending' };
  assert.equal((await getTrustedActor()).profile, null);
  profile = null;
  assert.equal((await getTrustedActor()).user, null);
  profileError = { message: 'profile lookup failed' };
  profile = { user_id: 'actor', role: 'Admin', account_status: 'active' };
  assert.equal((await getTrustedActor()).user, null);
  authUser = null;
  profileError = null;
  assert.equal((await getTrustedActor()).profile, null);
  authUser = { id: 'actor' };
  profile = { user_id: 'actor', role: 'Admin', account_status: 'active' };
  supabase.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({ data: { currentLevel: 'aal1' }, error: null });
  assert.equal((await getTrustedActor()).user, null);
});

test('approved web workflows share trusted identity resolution while retaining their own authorization', () => {
  for (const service of ['announcements', 'attendance', 'certificates', 'evaluations', 'progress', 'reports', 'schedule']) {
    const source = fs.readFileSync(path.join(root, `apps/web/src/services/${service}.ts`), 'utf8');
    assert.match(source, /import \{ getTrustedActor \} from '@\/src\/lib\/trusted-actor';/);
    assert.doesNotMatch(source, /function getAuthUserWithRole/);
  }
  const facade = fs.readFileSync(path.join(root, 'apps/web/src/services/auth.ts'), 'utf8');
  for (const exportedAction of ['registerStudent', 'signIn', 'signOut', 'requestPasswordReset', 'changeUserPassword', 'getAuthUser']) {
    assert.match(facade, new RegExp(`\\b${exportedAction}\\b`));
  }
  assert.doesNotMatch(facade, /verifyOtpAndResetPassword/);
});

function file(name, type, bytes) {
  return new File([bytes], name, { type });
}

test('upload validation checks size, extension, MIME and actual bytes', async () => {
  const { validateUploadedFile } = load('apps/web/src/lib/uploadValidation.ts');
  const pdf = file('report.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nexample'));
  assert.equal((await validateUploadedFile(pdf, ['.pdf'], 1024)).error, null);
  assert.equal((await validateUploadedFile(pdf, ['.pdf'], 4)).error.code, 'VALIDATION_FAILURE');
  assert.equal((await validateUploadedFile(file('report.exe', 'application/pdf', Buffer.from('%PDF-1.7')), ['.pdf'], 1024)).error.code, 'VALIDATION_FAILURE');
  assert.equal((await validateUploadedFile(file('report.pdf', 'application/pdf', Buffer.from('MZ malicious')), ['.pdf'], 1024)).error.code, 'VALIDATION_FAILURE');
  assert.equal((await validateUploadedFile(file('report.pdf', 'image/png', Buffer.from('%PDF-1.7')), ['.pdf'], 1024)).error.code, 'VALIDATION_FAILURE');
});

function signedDocumentFixture(pathVisible, studentOwner = 'student-user') {
  let signed = 0;
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'reviewer' } } }; } },
    storage: { from() { return { async createSignedUrl() {
      signed++; return { data: { signedUrl: 'https://signed.example.test/document' }, error: null };
    } }; } },
    from(table) {
      const q = { select() { return this; }, eq() { return this; }, limit() { return this; },
        async single() { return { data: table === 'users'
          ? { role: 'Supervisor', account_status: 'active' }
          : { user_id: studentOwner, student_id: 'student-id' } }; },
        async maybeSingle() { return { data: pathVisible ? { student_id: 'student-id' } : null, error: null }; },
      }; return q;
    },
  };
  const service = { storage: { from() { return { async createSignedUrl() {
    signed++; return { data: { signedUrl: 'https://signed.example.test/document' }, error: null };
  } }; } } };
  const storage = load('apps/web/src/services/storage.ts', {
    '@/src/lib/supabase/server': { createClient: async () => supabase },
    '@/src/lib/supabase/service': { getServiceClient: () => service },
  });
  return { storage, get signed() { return signed; } };
}

test('signed document requires a visible report and a matching student folder', async () => {
  const denied = signedDocumentFixture(false);
  assert.equal((await denied.storage.getSignedDocumentUrl('student-user/report.pdf')).error.code, 'FORBIDDEN');
  assert.equal(denied.signed, 0);
  const wrongOwner = signedDocumentFixture(true);
  assert.equal((await wrongOwner.storage.getSignedDocumentUrl('another-user/report.pdf')).error.code, 'FORBIDDEN');
  assert.equal(wrongOwner.signed, 0);
  const allowed = signedDocumentFixture(true);
  assert.equal((await allowed.storage.getSignedDocumentUrl('student-user/report.pdf')).error, null);
  assert.equal(allowed.signed, 1);
});

test('password recovery sends scoped one-time links without revealing unknown or wrong-role accounts', async () => {
  let profile = { user_id: 'student-1', role: 'Student', account_status: 'active' };
  const sent = [];
  const audited = [];
  const service = { from(table) {
    assert.equal(table, 'users');
    return { select() { return this; }, eq(column, email) { assert.equal(column, 'email'); assert.equal(email, 'student@example.test'); return this; },
      async maybeSingle() { return { data: profile, error: null }; } };
  } };
  const recovery = load('apps/web/src/services/auth/password-recovery.ts', {
    '@/src/lib/supabase/server': { async createClient() { return { auth: { async resetPasswordForEmail(email, options) { sent.push({ email, options }); return { error: null }; } } }; } },
    './internal': { serviceClient: () => service, async authActionLimit() { return null; } },
    '@/src/lib/audit': { async recordAuditEvent(event) { audited.push(event); } },
  }, { NEXT_PUBLIC_APP_URL: 'https://portal.example.test/' });

  const webWrongRole = await recovery.requestPasswordReset('student@example.test', 'Web');
  assert.equal(webWrongRole.error, null);
  assert.equal(sent.length, 0);
  assert.match(webWrongRole.data.message, /If an eligible account/);

  assert.equal((await recovery.requestPasswordReset('student@example.test', 'Student')).error, null);
  assert.equal(sent[0].options.redirectTo, 'cdm-ojt-monitoring://auth/reset-password');
  assert.equal(sent[0].email, 'student@example.test');

  profile = { user_id: 'coordinator-1', role: 'Coordinator', account_status: 'active' };
  profile.account_status = 'active';
  assert.equal((await recovery.requestPasswordReset('student@example.test', 'Web')).error, null);
  assert.equal(sent[1].options.redirectTo, 'https://portal.example.test/auth/callback?next=%2Fauth%2Fset-password');
  assert.equal(audited.length, 2);

  profile = null;
  assert.equal((await recovery.requestPasswordReset('student@example.test', 'Student')).data.message, webWrongRole.data.message);
  assert.equal(sent.length, 2);
});

test('mobile recovery accepts only its exact recovery deep link and supports PKCE and token callbacks', () => {
  const { parseStudentPasswordRecoveryUrl } = load('apps/mobile/src/lib/authRecoveryLink.ts');
  const pkce = parseStudentPasswordRecoveryUrl('cdm-ojt-monitoring://auth/reset-password?code=one-time');
  assert.equal(pkce.code, 'one-time');
  const token = parseStudentPasswordRecoveryUrl('cdm-ojt-monitoring://auth/reset-password#type=recovery&access_token=a&refresh_token=r');
  assert.equal(token.accessToken, 'a');
  assert.equal(token.refreshToken, 'r');
  assert.equal(parseStudentPasswordRecoveryUrl('cdm-ojt-monitoring://auth/reset-password.evil?code=x'), null);
  assert.equal(parseStudentPasswordRecoveryUrl('cdm-ojt-monitoring://auth/reset-password?type=signup&code=x'), null);
  assert.equal(parseStudentPasswordRecoveryUrl('https://portal.example.test/auth/reset-password?code=x'), null);
});

test('supervisor onboarding sends a setup invitation without creating a password', async () => {
  let invitation;
  let deleted = 0;
  const service = {
    auth: { admin: {
      async inviteUserByEmail(email, options) { invitation = { email, options }; return { data: { user: { id: 'supervisor-1' } }, error: null }; },
      async updateUserById() { return { error: null }; },
      async deleteUser() { deleted++; return { error: null }; },
    } },
    from() {
      return {
        delete() { return this; }, update() { return this; }, eq() { return this; }, like() { return this; },
        insert() { return Promise.resolve({ error: null }); },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
    },
  };
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'coordinator-1' } } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { role: 'Coordinator', account_status: 'active' } }; } }; },
  };
  const supervisors = load('apps/web/src/services/supervisors.ts', {
    '@/src/lib/supabase/server': { createClient: async () => supabase },
    '@/src/lib/supabase/service': { getServiceClient: () => service },
    '@/src/lib/department-scope': { async departmentScope() { return { error: null }; } },
  }, { NEXT_PUBLIC_APP_URL: 'https://portal.test' });
  const result = await supervisors.createSupervisor({
    full_name: 'Test Supervisor', email: 'supervisor@example.test',
    company_id: 'company-1', position: 'Mentor',
  });
  assert.equal(result.error, null);
  assert.equal(invitation.email, 'supervisor@example.test');
  assert.equal(invitation.options.data.role, 'Supervisor');
  assert.match(invitation.options.redirectTo, /auth\/callback/);
  assert.equal(Object.hasOwn(invitation.options, 'password'), false);
  assert.equal(deleted, 0);
});

test('supervisor onboarding rolls back only the newly invited account when profile setup fails', async () => {
  let deletedId = '';
  const service = {
    auth: { admin: {
      async inviteUserByEmail() { return { data: { user: { id: 'supervisor-2' } }, error: null }; },
      async updateUserById() { return { error: null }; },
      async deleteUser(id) { deletedId = id; return { error: null }; },
    } },
    from(table) {
      return {
        delete() { return this; }, update() { return this; }, eq() { return this; }, like() { return this; },
        insert() { return Promise.resolve({ error: table === 'supervisors' ? { message: 'write failed' } : null }); },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
    },
  };
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'coordinator-1' } } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: { role: 'Coordinator', account_status: 'active' } }; } }; },
  };
  const supervisors = load('apps/web/src/services/supervisors.ts', {
    '@/src/lib/supabase/server': { createClient: async () => supabase },
    '@/src/lib/supabase/service': { getServiceClient: () => service },
    '@/src/lib/department-scope': { async departmentScope() { return { error: null }; } },
  }, { NEXT_PUBLIC_APP_URL: 'https://portal.test' });
  const result = await supervisors.createSupervisor({
    full_name: 'Test Supervisor', email: 'supervisor@example.test',
    company_id: 'company-1', position: 'Mentor',
  });
  assert.equal(result.error.code, 'SERVER_FAILURE');
  assert.equal(deletedId, 'supervisor-2');
});

test('audit listing reports a database failure instead of showing an empty log', async () => {
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'admin-1' } } }; }, mfa: { async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal2' }, error: null }; } } },
    from() { return { select() { return this; }, eq() { return this; },
      async single() { return { data: { role: 'Admin', account_status: 'active' } }; } }; },
  };
  const service = { from() { return {
    select() { return this; }, order() { return this; },
    async range() { return { data: null, error: { message: 'database unavailable' } }; },
  }; } };
  const logs = [];
  const audit = load('apps/web/src/services/audit.ts', {
    '@/src/lib/supabase/server': { createClient: async () => supabase },
    '@/src/lib/supabase/service': { getServiceClient: () => service },
  }, {}, { console: { error: (...parts) => logs.push(parts.join(' ')) } });
  const result = await audit.listAuditLogs();
  assert.equal(audit.recordAuditEvent, undefined, 'internal audit writer must not be exported as a Server Action');
  assert.equal(result.error.code, 'SERVER_FAILURE');
  assert.equal(result.data, null);
  assert.ok(logs.some(line => line.includes('database unavailable')));
});


test('former supervisors cannot verify attendance or submit evaluations through service-role actions', async () => {
 const fixture = workflowFixture('Supervisor', {tables:{
  supervisors:[{user_id:'actor',supervisor_id:'supervisor'}],
  student_assignments:[{assignment_id:'assignment',student_id:'student',supervisor_id:'supervisor',assignment_status:'completed'}],
  attendance:[{attendance_id:attendanceId(1),student_id:'student',verification_status:'pending'}],
 }});
 assert.equal((await fixture.module('attendance').verifyAttendance(attendanceId(1),'verified')).error.code,'FORBIDDEN');
 assert.equal((await fixture.module('evaluations').createEvaluation({student_id:'student',performance_score:null,feedback:'Test',evaluation_type:'final',criteria: { technical_competence: 5, productivity_dependability: 4, attendance_punctuality: 4, communication_skills: 4, work_ethics_professionalism: 4 }})).error.code,'FORBIDDEN');
 assert.equal(fixture.writes.length,0);
});


test('desktop export rejects untrusted frames, path traversal, changed folders and overwrite', () => {
  const { createDesktopSecurity } = require('../apps/desktop/src/security');
  const folder = path.resolve(root, 'synthetic-exports');
  const writes = new Map();
  let redirected = false;
  const disk = {
    realpathSync(value) { return redirected ? value + '-replaced' : value; },
    writeFileSync(name, bytes, options) {
      assert.equal(options.flag, 'wx');
      if (writes.has(name)) { const error = new Error('Exists'); error.code = 'EEXIST'; throw error; }
      writes.set(name, bytes);
    },
  };
  const frame = { url: 'https://portal.example/coordinator' };
  const win = { webContents: { mainFrame: frame } };
  const event = { sender: win.webContents, senderFrame: frame };
  const security = createDesktopSecurity(() => win, 'https://portal.example', path.join(root, 'loader.html'), disk);
  const input = { folderPath: folder, fileName: 'report.csv', fileData: Buffer.from('name,hours').toString('base64') };
  assert.throws(() => security.saveFile(event, input), /Choose/);
  security.selectFolder(event, folder);
  for (const fileName of ['../outside.csv', 'C:\\outside.csv', 'CON.csv', 'report.exe', 'report.csv.', 'report.csv:stream']) {
    assert.throws(() => security.saveFile(event, { ...input, fileName }), /valid export/);
  }
  assert.throws(() => security.saveFile({ sender: {}, senderFrame: frame }, input), /Untrusted/);
  assert.throws(() => security.saveFile({ sender: win.webContents, senderFrame: { url: frame.url } }, input), /Untrusted/);
  frame.url = 'https://attacker.example';
  assert.throws(() => security.saveFile(event, input), /Untrusted/);
  assert.equal(security.allowNavigation(frame.url), false);
  frame.url = 'https://portal.example/reports';
  redirected = true;
  assert.throws(() => security.saveFile(event, input), /Destination changed/);
  redirected = false;
  assert.equal(security.saveFile(event, input).success, true);
  assert.equal(writes.size, 1);
  assert.throws(() => security.saveFile(event, input), { code: 'EEXIST' });
  security.clearFolder();
  assert.throws(() => security.saveFile(event, { ...input, fileName: 'other.csv' }), /Choose/);
});

function offlineQueueFixture(raw = null) {
  const state = { raw, writes: 0, deleted: [], failWrite: false };
  const queue = load('apps/mobile/src/lib/offlineQueue.ts', {
    '@ojt/shared': { getAttendanceDate: () => '2026-10-08' },
    'expo-secure-store': {
      async getItemAsync() { return state.raw; },
      async setItemAsync(_key, value) { if (state.failWrite) throw new Error('Disk full'); state.writes++; state.raw = value; },
    },
    'expo-file-system/legacy': { documentDirectory: 'file:///private/', async deleteAsync(uri) { state.deleted.push(uri); } },
  });
  return { state, queue };
}
const queuedAttendance = { type: 'time_in', student_id: 's1', assignment_id: 'a1', local_photo_uri: 'file:///private/offline_selfies/a.jpg', captured_at: '2026-10-08T01:00:00Z', attendance_date: '2026-10-08' };

test('unreadable offline attendance remains untouched when enqueue is attempted', async () => {
  for (const corrupt of ['{broken', '{}', '[{}]']) {
    const { state, queue } = offlineQueueFixture(corrupt);
    await assert.rejects(queue.enqueueOfflineAttendance(queuedAttendance), /Do not clear app data/);
    assert.equal(state.raw, corrupt);
    assert.equal(state.writes, 0);
  }
});

test('concurrent offline enqueue preserves both records and failed removal preserves photo', async () => {
  const { state, queue } = offlineQueueFixture();
  const [first, second] = await Promise.all([
    queue.enqueueOfflineAttendance(queuedAttendance),
    queue.enqueueOfflineAttendance({ ...queuedAttendance, type: 'time_out' }),
  ]);
  assert.equal((await queue.getOfflineQueue()).length, 2);
  state.failWrite = true;
  await assert.rejects(queue.removeOfflineQueueItem(first.id), /Disk full/);
  assert.equal((await queue.getOfflineQueue()).length, 2);
  assert.equal(state.deleted.length, 0);
  state.failWrite = false;
  await queue.removeOfflineQueueItem(first.id);
  assert.equal(state.deleted.length, 0, 'photo is still referenced by second entry');
  await queue.removeOfflineQueueItem(second.id);
  assert.equal((await queue.getOfflineQueue()).length, 0);
  assert.deepEqual(state.deleted, [queuedAttendance.local_photo_uri]);
});


test('registration upload bounds requests before invoking the upload service', async () => {
  let calls = 0;
  const route = load('apps/web/app/api/registration/id-card/route.ts', {
    '@/src/lib/mobile-bff': { async authenticateMobileStudent() { throw new Error('unauthenticated upload must not call student auth'); }, mobileBffFailure() { throw new Error('unexpected auth failure'); } },
    '@/src/services/auth': { async uploadStudentIdCard(form) { calls++; assert.equal(form.get('email'), 'test@example.invalid'); return { data: { file_path: 'id-cards/test.jpg' }, error: null }; } },
  });
  assert.equal((await route.POST(new Request('https://portal.example/api/registration/id-card', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal((await route.POST(new Request('https://portal.example/api/registration/id-card', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test', 'content-length': String(12*1024*1024) }, body: 'x' }))).status, 413);
  const oversized = new Request('https://portal.example/api/registration/id-card', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: new Uint8Array(11*1024*1024+1) });
  assert.equal((await route.POST(oversized)).status, 413);
  assert.equal(calls, 0);
  const form = new FormData(); form.set('email','test@example.invalid'); form.set('file',file('id.jpg','image/jpeg',[255,216,255]));
  const result = await route.POST(new Request('https://portal.example/api/registration/id-card', { method: 'POST', body: form }));
  assert.equal(result.status, 200); assert.equal(calls, 1);
});

test('public registration stream cap rejects oversized JSON without Content-Length', async () => {
  let calls = 0;
  const route = load('apps/web/app/api/registration/submit/route.ts', {
    '@/src/services/auth/registration': { async registerStudent() { calls++; return { data: null, error: null }; } },
  });
  const oversized = new Request('https://portal.example/api/registration/submit', {
    method: 'POST', body: new Uint8Array(16 * 1024 + 1),
  });
  assert.equal(oversized.headers.has('content-length'), false);
  assert.equal((await route.POST(oversized)).status, 413);
  assert.equal(calls, 0);
  assert.equal((await route.POST(new Request('https://portal.example/api/registration/submit', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }))).status, 200);
  assert.equal(calls, 1);
});

test('attendance rejects a date outside the student assignment range before writing', async () => {
  const tables = [];
  const service = {
    from(table) {
      tables.push(table);
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() {
          assert.equal(table, 'student_assignments');
          return { data: { assignment_id: 'assignment', company_id: 'company', start_date: '2026-10-20', end_date: null }, error: null };
        },
      };
    },
    storage: { from() { return {
      async info() { return { data: { size: 1, contentType: 'image/jpeg' }, error: null }; },
      async download() { return { data: { type: 'image/jpeg', async arrayBuffer() { return new ArrayBuffer(1); } }, error: null }; },
    }; } },
  };
  const route = load('apps/web/app/api/mobile/attendance/route.ts', {
    '@ojt/shared': {
      getAttendanceDate: () => '2026-10-19',
      getPhilippineClock: () => new Date('2026-10-19T09:00:00Z'),
      isWithinGeofence: () => ({ isWithin: true, distanceMeters: 0 }),
    },
    '@/src/lib/mobile-bff': {
      async authenticateMobileStudent() { return { actor: { user: { id: 'user' }, studentId: 'student' }, error: null }; },
      mobileBffFailure(error) { return Response.json({ error: error.code }, { status: error.status }); },
    },
    '@/src/lib/supabase/service': { getServiceClient: () => service },
    '@/src/services/auth/internal': { async authActionLimit() { return null; } },
    '@/src/lib/uploadValidation': { validateUploadedBytes() { return { data: true, error: null }; } },
  });
  const response = await route.POST(new Request('https://portal.example/api/mobile/attendance', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      action: 'time_in', assignment_id: 'assignment', attendance_date: '2026-10-19',
      time_in: '2026-10-19T01:00:00.000Z', time_in_selfie_path: 'student/time_in_test.jpg',
      latitude: 14, longitude: 121,
    }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(tables, ['student_assignments']);
});

test('attendance rejects future-dated Time In and Time Out against the server clock before any lookup', async () => {
  const route = load('apps/web/app/api/mobile/attendance/route.ts', {
    '@ojt/shared': {
      ...load('shared/attendanceDate.ts'),
      isWithinGeofence: () => ({ isWithin: true, distanceMeters: 0 }),
    },
    '@/src/lib/mobile-bff': {
      async authenticateMobileStudent() { return { actor: { user: { id: 'user' }, studentId: 'student' }, error: null }; },
      mobileBffFailure(error) { return Response.json({ error: error.code }, { status: error.status }); },
    },
    '@/src/lib/supabase/service': { getServiceClient: () => ({
      from() { throw new Error('future attendance must not reach the database'); },
      storage: { from() { throw new Error('future attendance must not reach storage'); } },
    }) },
    '@/src/services/auth/internal': { async authActionLimit() { return null; } },
    '@/src/lib/uploadValidation': { validateUploadedBytes() { return { data: true, error: null }; } },
  });
  const { getAttendanceDate } = load('shared/attendanceDate.ts');
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const post = body => route.POST(new Request('https://portal.example/api/mobile/attendance', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 14, longitude: 121, ...body }),
  }));
  for (const body of [
    { action: 'time_in', assignment_id: 'assignment', attendance_date: getAttendanceDate(future), time_in: future.toISOString(), time_in_selfie_path: 'student/time_in_future.jpg' },
    { action: 'time_out', attendance_date: getAttendanceDate(future), time_out: future.toISOString(), time_out_selfie_path: 'student/time_out_future.jpg' },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 400, body.action);
    assert.equal((await response.json()).error, 'VALIDATION_FAILURE');
  }
});

test('offline attendance from a closed assignment syncs within its placement dates and stays pending', async () => {
  const rows = {
    student_assignments: [{ assignment_id: 'assignment', student_id: 'student', company_id: 'company', branch_id: 'branch', assignment_status: 'completed', start_date: '2026-10-01', end_date: '2026-10-19' }],
    company_branches: [{ company_id: 'company', branch_id: 'branch', status: 'inactive', latitude: 14, longitude: 121, geofence_radius_meters: 150, geofence_enabled: true }],
    practicum_schedules: [{ student_id: 'student', company_id: 'company', branch_id: 'branch', status: 'approved', start_date: '2026-10-01', end_date: '2026-10-19', work_modality: 'on_site' }],
    attendance: [], work_schedules: [],
  };
  let inserted = null;
  const client = { from(table) {
    let operation = 'select'; let values = null; const filters = [];
    const query = {
      select() { return this; },
      eq(column, value) { filters.push(row => row[column] === value); return this; },
      lte(column, value) { filters.push(row => row[column] <= value); return this; },
      or(expression) {
        const match = /end_date\.gte\.(\d{4}-\d{2}-\d{2})/.exec(expression);
        const date = match?.[1];
        filters.push(row => row.end_date == null || !date || row.end_date >= date);
        return this;
      },
      order() { return this; }, limit() { return this; },
      insert(value) { operation = 'insert'; values = value; return this; },
      async maybeSingle() {
        if (operation === 'insert') { inserted = { ...values, attendance_id: 'synced-attendance' }; rows[table].push(inserted); return { data: inserted, error: null }; }
        return { data: (rows[table] || []).find(row => filters.every(filter => filter(row))) || null, error: null };
      },
      async single() { return this.maybeSingle(); },
    };
    return query;
  } };
  const route = load('apps/web/app/api/mobile/attendance/route.ts', {
    '@ojt/shared': {
      getAttendanceDate: () => '2026-10-19',
      getPhilippineClock: () => new Date('2026-10-19T09:00:00Z'),
      isWithinGeofence: () => ({ isWithin: true, distanceMeters: 0 }),
    },
    '@/src/lib/mobile-bff': {
      async authenticateMobileStudent() { return { actor: { user: { id: 'user' }, studentId: 'student', supabase: client }, error: null }; },
      mobileBffFailure(error) { return Response.json({ error: error.code }, { status: error.status }); },
    },
    '@/src/lib/supabase/service': { getServiceClient: () => ({ ...client, storage: { from: () => ({
      async info() { return { data: { size: 1, contentType: 'image/jpeg' }, error: null }; },
      async download() { return { data: { type: 'image/jpeg', async arrayBuffer() { return new ArrayBuffer(1); } }, error: null }; },
    }) } }) },
    '@/src/services/auth/internal': { async authActionLimit() { return null; } },
    '@/src/lib/uploadValidation': { validateUploadedBytes() { return { data: true, error: null }; } },
  });
  const capturedAt = '2026-10-19T01:00:00.000Z';
  const response = await route.POST(new Request('https://portal.example/api/mobile/attendance', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      action: 'time_in', assignment_id: 'assignment', attendance_date: '2026-10-19',
      time_in: capturedAt, time_in_selfie_path: 'student/time_in_delayed.jpg', latitude: 14, longitude: 121,
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(inserted.time_in, capturedAt);
  assert.equal(inserted.verification_status, 'pending');
  assert.ok(inserted.time_in_received_at, 'server receipt time is recorded separately');
});

test('student resubmission requires the rejected-student BFF and bounds streamed JSON', async () => {
  let submitted = null;
  const route = load('apps/web/app/api/mobile/registration/resubmit/route.ts', {
    '@/src/lib/mobile-bff': {
      async authenticateMobileStudent(_request, status) {
        assert.equal(status, 'rejected');
        return { actor: { user: { id: 'student-user' }, studentId: 'student-row' }, error: null };
      },
      mobileBffFailure(error) {
        return Response.json({ data: null, error: { code: error.code } }, { status: error.status });
      },
    },
    '@/src/lib/supabase/service': { getServiceClient() { throw new Error('POST must not read registration data directly'); } },
    '@/src/services/auth/registration': {
      async resubmitStudentRegistration(userId, input) {
        submitted = { userId, input };
        return { data: null, error: null };
      },
    },
  });
  const oversized = new Request('https://portal.example/api/mobile/registration/resubmit', {
    method: 'POST', headers: { authorization: 'Bearer rejected-student-token' }, body: new Uint8Array(16 * 1024 + 1),
  });
  assert.equal((await route.POST(oversized)).status, 413);
  assert.equal(submitted, null);

  const input = {
    full_name: 'Test Student', student_number: '2026-12345', course: 'BSIT', year_level: 4,
    id_card_front_path: 'id-cards/front.jpg', id_card_back_path: 'id-cards/back.jpg',
  };
  const response = await route.POST(new Request('https://portal.example/api/mobile/registration/resubmit', {
    method: 'POST', headers: { authorization: 'Bearer rejected-student-token', 'content-type': 'application/json' }, body: JSON.stringify(input),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { userId: 'student-user', input });
});

test('readiness requires the current security revision and a private selfie bucket without reading internal counters', async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
  function ready(revision, storage, globals = {}) {
    return load('apps/web/app/ready/route.ts', { '@/src/lib/supabase/service': { getServiceClient: () => ({
      from: () => { throw new Error('readiness must not directly inspect internal counters'); },
      rpc: () => ({ abortSignal: () => Promise.resolve({ data: revision, error: null }) }),
      storage: { getBucket: () => storage },
    }) } }, env, globals);
  }
  const bucket = Promise.resolve({ data: { public: false }, error: null });
  assert.equal((await ready(40, bucket).GET()).status, 503);
  assert.equal((await ready(41, bucket).GET()).status, 503);
  assert.equal((await ready(42, bucket).GET()).status, 503);
  assert.equal((await ready(43, bucket).GET()).status, 503);
  assert.equal((await ready(44, bucket).GET()).status, 200);
  assert.equal((await ready(34, bucket).GET()).status, 503);
  assert.equal((await ready(32, bucket).GET()).status, 503);
  assert.equal((await ready(30, bucket).GET()).status, 503);
  const hanging = ready(34, new Promise(() => {}), { setTimeout(callback, ms) { assert.equal(ms, 4000); return setTimeout(callback, 1); } });
  assert.equal((await hanging.GET()).status, 503);
});
test('mobile recovery requires an explicit HTTPS portal for release builds', () => {
  const module = env => load('apps/mobile/src/lib/webPortal.ts', {}, env);
  assert.throws(() => module({}).getWebPortalUrl('/auth/reset-password'), /not configured/);
  assert.throws(() => module({ EXPO_PUBLIC_WEB_URL: 'http://portal.example' }).getWebPortalUrl('/auth/reset-password'), /secure connection/);
  assert.equal(module({ EXPO_PUBLIC_WEB_URL: 'https://portal.example' }).getWebPortalUrl('/auth/reset-password?role=Student'), 'https://portal.example/auth/reset-password?role=Student');
});
test('Docker server Supabase URLs are rewritten to the browser origin for signed links', () => {
  const helper = load('apps/web/src/lib/supabase/public-url.ts', {}, {
    SUPABASE_URL: 'http://host.docker.internal:54321',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  });
  const internalUrl = 'http://host.docker.internal:54321/storage/v1/object/sign/private-documents/student/report.pdf?token=one-time';
  assert.equal(
    helper.toPublicSupabaseUrl(internalUrl),
    'http://127.0.0.1:54321/storage/v1/object/sign/private-documents/student/report.pdf?token=one-time',
  );
  const externalUrl = 'https://cdn.example.test/report.pdf';
  assert.equal(helper.toPublicSupabaseUrl(externalUrl), externalUrl);
});

test('HTE geofence radius is limited to 30-50 m for companies and branches', async () => {
  // No signed-in user: inputs that pass validation stop at FORBIDDEN, rejected ones at VALIDATION_FAILURE.
  const client = { auth: { async getUser() { return { data: { user: null } }; } } };
  const companies = load('apps/web/src/services/companies.ts', {
    '@/src/lib/supabase/server': { createClient: async () => client },
    '@/src/lib/audit': { recordAuditEvent: async () => {} },
  });
  const company = { company_name: 'HTE', address: '1 Road', contact_person: 'Contact', contact_email: 'hte@example.test', contact_number: '0000' };
  const branch = { company_id: 'company', branch_name: 'Branch', address: '1 Road', latitude: 14, longitude: 121 };
  for (const [radius, code] of [[29, 'VALIDATION_FAILURE'], [51, 'VALIDATION_FAILURE'], [30, 'FORBIDDEN'], [40, 'FORBIDDEN'], [50, 'FORBIDDEN']]) {
    const created = await companies.createCompany({ ...company, geofence_radius_meters: radius });
    assert.equal(created.error.code, code, `company radius ${radius}`);
    if (code === 'VALIDATION_FAILURE') assert.match(created.error.message, /between 30 and 50 meters/);
    assert.equal((await companies.createCompanyBranch({ ...branch, geofence_radius_meters: radius })).error.code, code, `branch radius ${radius}`);
  }
  // Omitted radius falls back to the 50 m default, which is valid.
  assert.equal((await companies.createCompanyBranch(branch)).error.code, 'FORBIDDEN');
});
